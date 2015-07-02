
function FireTweet(baseURL, newContext) {
  var self = this;
  this._name = null;
  this._facebookId = null;
  this._firebase = null;
  this._mainUser = null;
  this._fullName = null;
  this._searchHandler = null;
  this._currentSearch = null;
  this._baseURL = baseURL;

  this._handlers = [];

  if (!baseURL || typeof baseURL != "string") {
    throw new Error("Invalid baseURL provided");
  }
  this._firebase = new Firebase(
    baseURL, newContext || false ? new Firebase.Context() : null
  );

  this._authHandlers = [];
  this._firebase.onAuth(self._onLoginStateChange.bind(self));
}
FireTweet.prototype = {
  _validateCallback: function(cb, notInit) {
    if (!cb || typeof cb != "function") {
      throw new Error("Invalid onComplete callback provided");
    }
    if (!notInit) {
      if (!this._uid || !this._firebase) {
        throw new Error("Method called without a preceding login() call");
      }
    }
  },
  _validateString: function(str, name) {
    if (!str || typeof str != "string") {
      throw new Error("Invalid " + name + " provided");
    }
  },
  _getParameterByName: function(name) {
    var expr = "[?&]" + name + "=([^&]*)";
    var match = RegExp(expr).exec(window.location.search);
    return match && decodeURIComponent(match[1].replace(/\+/g, " "));
  },
  _getPicURL: function(id, large) {
    if (id) {
      id = id.replace('facebook:', '');
    }
    return "https://graph.facebook.com/" + (id || this._uid.replace('facebook:', '')) +
           "/picture/?type=" + (large ? "large" : "square") +
           "&return_ssl_resources=1";
  },
  _onNewSparkForFeed: function(feed, onComplete, onOverflow) {
    var self = this;


    var handler = feed.on("child_added", function(snap) {

      var sparkID = snap.name();
      var sparkRef = self._firebase.child("sparks").child(sparkID);
      var handler = sparkRef.on("value", function(sparkSnap) {
        var ret = sparkSnap.val();
        if (ret !== null) {
          ret.pic = self._getPicURL(ret.author);
          onComplete(sparkSnap.name(), ret);
        }
      });
      self._handlers.push({
        ref: sparkRef, handler: handler, eventType: "value"
      });
    });
    self._handlers.push({
      ref: feed, handler: handler, eventType: "child_added"
    });


    handler = feed.on("child_removed", function(snap) {
      onOverflow(snap.name());
    });
    self._handlers.push({
      ref: feed, handler: handler, eventType: "child_removed"
    });
  },
  _onLoginStateChange: function(user) {

    var self = this;
    if (user) {

      this.onLogin(user);
    } else {

      this.onLogout();
    }
  },
  onStateChange: function(cb) {
    this._firebase.onAuth(cb.bind(this));
  }
};


FireTweet.prototype.onLoginStateChange = function(onLoginStateChange) {
  var self = this;
  self._validateCallback(onLoginStateChange, true);
  this._authHandlers.push(onLoginStateChange);
};

FireTweet.prototype.login = function(provider) {
  this._firebase.authWithOAuthPopup(provider, this.onLogin.bind(this));
};

FireTweet.prototype.logout = function() {
  if (this._uid) {

    var peopleRef = this._firebase.child("people").child(this._uid);
    peopleRef.child("presence").set("offline");
  }
  this._firebase.unauth();
};


FireTweet.prototype.onLogin = function(user) {
  var self = this;
  if (!user) { return; }

  this._uid = user.uid;
  this._facebookId = user.facebook.id;


  var displayName = user.facebook.displayName.split(' ');
  user.first_name = displayName[0];
  user.last_name = displayName[displayName.length - 1];
  user.id = user.uid;
  user.name = user.facebook.displayName;
  user.location = '';
  user.bio = '';
  user.pic = this._getPicURL(user.id, false);


  var firstNameKey = [user['first_name'], user['last_name'], user['id']].join('|').toLowerCase();
  var lastNameKey = [user['last_name'], user['first_name'], user['id']].join('|').toLowerCase();
  this._firebase.child('search/firstName').child(firstNameKey).set(user['id']);
  this._firebase.child('search/lastName').child(lastNameKey).set(user['id']);

  this._mainUser = self._firebase.child("users").child(this._uid);
  this._fullName = user.name;
  this._name = user.first_name;

  var peopleRef = self._firebase.child("people").child(this._uid);
  peopleRef.once("value", function(peopleSnap) {
    var info = {};
    var val = peopleSnap.val();
    if (!val) {

      info = {
        name: self._name,
        fullName: self._fullName,
        location: "",
        bio: "",
        pic: self._getPicURL()
      };
      peopleRef.set(info);
    } else {
      info = val;
    }
    peopleRef.child("presence").set("online");
    info.id = self._uid;
    self._user = info;


    for (var i = 0; i < self._authHandlers.length; i++) {
      self._authHandlers[i](null, self._user);
    }
  });
}


FireTweet.prototype.onLogout = function() {
  this._user = null;
  this._facebookId = null;
  this._mainUser = null;
  this._fullName = null;
  this._name = null;


  var self = this;
  for (var i = 0; i < this._authHandlers.length; i++) {
    self._authHandlers[i](null, null);
  }
};


FireTweet.prototype.getUserInfo = function(user, onComplete,
                                          onFollower, onFollowersComplete,
                                          onFollowee, onFolloweesComplete) {
  var self = this;
  self._validateCallback(onComplete, true);

  var ref = self._firebase.child("people").child(user);
  var handler = ref.on("value", function(snap) {
    var val = snap.val();
    val.pic = self._getPicURL(snap.name(), true);
    val.bio = val.bio.substr(0, 141);
    val.location = val.location.substr(0, 80);
    onComplete(val);
  });
  self._handlers.push({
    ref: ref, handler: handler, eventType: "value"
  });

  var userRef = self._firebase.child('users').child(user);
  var followerRef = userRef.child('followers');
  var followerHandle = followerRef.on('child_added', function(snapshot) {
    self._firebase.child('people').child(snapshot.name()).once('value', function(snap) {
      var userInfo = snap.val();
      userInfo['userId'] = snapshot.name();
      if (onFollower) onFollower(userInfo);
    });
  });
  self._handlers.push({
    ref: followerRef, handle: followerHandle, eventType: 'child_added'
  });
  followerRef.once('value', function(snap) {
    if (onFollowersComplete) onFollowersComplete();
  });

  var followeeRef = userRef.child('following');
  var followeeHandle = followeeRef.on('child_added', function(snapshot) {
    self._firebase.child('people').child(snapshot.name()).once('value', function(snap) {
      var userInfo = snap.val();
      userInfo['userId'] = snapshot.name();
      if (onFollowee) onFollowee(userInfo);
    });
  });
  self._handlers.push({
    ref: followeeRef, handle: followeeHandle, eventType: 'child_added'
  });
  followeeRef.once('value', function(snap) {
    if (onFolloweesComplete) onFolloweesComplete();
  });
};


FireTweet.prototype.startSearch = function(resultsHandler) {
  this._searchHandler = resultsHandler;
};

FireTweet.prototype.updateSearchTerm = function(term) {
  var isValidStem = function(stem) {
    var invalid = ['.', '#', '$', '/', '[', ']'];
    for (var i = 0; i < invalid.length; ++i) {
      if (stem.indexOf([invalid[i]]) !== -1) {
        return false;
      }
    }
    return true;
  };

  if (isValidStem(term) && term.length >= 3) {
    if (this._currentSearch) {

      if (this._currentSearch.containsTerm(term)) {

        this._currentSearch.updateTerm(term);
      } else {

        this.stopSearching();
      }
    } else {

      this._currentSearch = new FireTweetSearch(this._firebase, term, this._searchHandler);
    }
  } else {
    this.stopSearching();
  }
};

FireTweet.prototype.stopSearching = function() {
  if (this._currentSearch) {
    this._currentSearch.stopSearch();
    this._currentSearch = null;
  }
  this._searchHandler && this._searchHandler([]);
};

FireTweet.prototype.getSpark = function(id, onComplete) {
  var self = this;
  self._validateCallback(onComplete, true);
  self._firebase.child("sparks").child(id).once("value", function(snap) {
    onComplete(snap.val());
  });
};


FireTweet.prototype.follow = function(user, onComplete) {
  var self = this;
  self._validateString(user, "user");
  self._validateCallback(onComplete);


  self._mainUser.child("following").child(user).set(true, function(err) {
    if (err) {
      onComplete(new Error("Could not follow user"), false);
      return;
    }


    var followUser = self._firebase.child("users").child(user);
    followUser.child("followers").child(self._uid).set(true);


    var myFeed = self._mainUser.child("feed");
    followUser.child("sparks").once("value", function(sparkSnap) {
      sparkSnap.forEach(function(spark) {
        myFeed.child(spark.name()).set(true);
      });
    });


    onComplete(false, user);
  });
};


FireTweet.prototype.post = function(content, onComplete) {
  var self = this;
  self._validateString(content, "spark");
  self._validateCallback(onComplete);


  var sparkRef = self._firebase.child("sparks").push();
  var sparkRefId = sparkRef.name();
  var spark = {
    author: self._uid,
    by: self._fullName,
    content: content,
    timestamp: new Date().getTime()
  };

  sparkRef.set(spark, function(err) {
    if (err) {
      onComplete(new Error("Could not post spark"), false);
      return;
    }


    var feedSparkRef = self._mainUser.child("sparks").child(sparkRefId);
    feedSparkRef.set(true, function(err) {
      if (err) {
        onComplete(new Error("Could not add spark to feed"), false);
        return;
      }


      self._mainUser.child("feed").child(sparkRefId).set(true);


      var time = new Date().getTime();
      var recentUsersRef = self._firebase.child("recent-users");

      recentUsersRef.child(self._uid).setWithPriority(true, time);

      var recentSparkRef = self._firebase.child("recent-sparks");
      recentSparkRef.child(sparkRefId).setWithPriority(true, time);

      self._mainUser.child("followers").once("value", function(followerList) {
        followerList.forEach(function(follower) {
          if (!follower.val()) {
            return;
          }
          var childRef = self._firebase.child("users").child(follower.name());
          childRef.child("feed").child(sparkRefId).set(true);
        });
      });


      onComplete(false, sparkRefId);
    });
  });
};


FireTweet.prototype.getSuggestedUsers = function(onSuggestedUser) {
  var self = this;
  self._validateCallback(onSuggestedUser);


  var followerList = [];
  self._mainUser.child("following").once("value", function(followSnap) {
    followerList = [];
    var snap = followSnap.val() || {};
    for (var k in snap) {
      if (snap.hasOwnProperty(k)) {
        followerList.push(k);
      }
    }


    var recentUsersQuery = self._firebase.child("recent-users").limit(20);
    var count = 0;

    var recentUsersRef = self._firebase.child("recent-users");
    recentUsersRef.once("value", function(recentUsersSnap) {
      recentUsersSnap.forEach(function(recentUserSnap) {
        if (count >= 5) {
          return true;
        }
        var userid = recentUserSnap.name();
        if (userid == self._uid || followerList.indexOf(userid) >= 0) {
          return;
        }
        count++;

        self.getUserInfo(userid, function(userInfo) {
          onSuggestedUser(userid, userInfo);
        });
      });
    });
  });
};


FireTweet.prototype.setProfileField = function(field, value) {
  var peopleRef = this._firebase.child("people").child(this._uid);
  peopleRef.child(field).set(value);
};


FireTweet.prototype.onNewSpark = function(totalCount, onComplete, onOverflow) {
  this._validateCallback(onComplete);
  this._validateCallback(onOverflow);

  var feed = this._mainUser.child("feed").limit(totalCount || 100);
  this._onNewSparkForFeed(feed, onComplete, onOverflow);
};
FireTweet.prototype.onNewSparkFor = function(id, count, onComplete, onOverflow) {
  this._validateCallback(onComplete, true);
  this._validateCallback(onOverflow, true);

  var feed = this._firebase.child("users").child(id).child("sparks");
  feed = feed.limit(count || 10);

  this._onNewSparkForFeed(feed, onComplete, onOverflow);
}


FireTweet.prototype.onLatestSpark = function(count, onComplete, onOverflow) {
  this._validateCallback(onComplete, true);
  this._validateCallback(onOverflow, true);

  var feed = this._firebase.child("recent-sparks");
  feed = feed.limit(count || 5);

  this._onNewSparkForFeed(feed, onComplete, onOverflow);
};


FireTweet.prototype.unload = function() {
  for (var i = 0; i < this._handlers.length; i++) {
    var ref = this._handlers[i].ref;
    var handler = this._handlers[i].handler;
    var eventType = this._handlers[i].eventType;
    ref.off(eventType, handler);
  }
  this._handlers = [];
};
