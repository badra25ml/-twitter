
var __ff_ui;
$(function() {
  __ff_ui = new FireTweetUI();
});

function FireTweetUI() {
  this._limit = 141;
  this._loggedIn = false;
  this._spinner = new Spinner();
  this._FireTweet = new FireTweet("https://twitterclone1.firebaseio.com/");
  this._unload = null;

  // Setup page navigation.
  this._setupHandlers();

  // Setup History listener.
  var self = this;
  window.History.Adapter.bind(window, "statechange", function() {
    self._pageController(window.History.getState().hash, false);
  });

  self._FireTweet.onStateChange(function(user) {
    self.onLoginStateChange(user);
  });
}

FireTweetUI.prototype._setupHandlers = function() {
  var self = this;
  $(document).on("click", "a.profile-link", function(e) {
    e.preventDefault();
    self._go($(this).attr("href"));
  });
  $(document).on("click", "a.spark-link", function(e) {
    e.preventDefault();
    self._go($(this).attr("href"));
  });
  $(document).on("click", "#search-button", function(e) {
    e.preventDefault();
    self._go("/?search");
  });
  $(document).on("click", "#top-logo", function(e) {
    e.preventDefault();
    self._go("/");
  });
  $(document).on("click", "#logout-button", function(e) {
    e.preventDefault();
    self.logout();
  });
};

FireTweetUI.prototype._go = function(url) {
  window.History.pushState(null, null, url);
};

FireTweetUI.prototype._pageController = function(url) {
  // Extract sub page from URL, if any.
  var idx = url.indexOf("?");
  var hash = (idx > 0) ? url.slice(idx + 1) : "";
  var value = hash.split("=");

  this._unload && this._unload();

  switch (value[0]) {
    case "profile":
      if (!value[1]) {
        this._unload = this.render404();
      } else {
        this._unload = this.renderProfile(value[1]);
      }
      break;
    case "spark":
      if (!value[1]) {
        this._unload = this.render404();
      } else {
        this._unload = this.renderSpark(value[1]);
      }
      break;
    case "search":
      this._unload = this.renderSearch();
      break;
    default:
      if (this._loggedIn) {
        this._unload = this.renderTimeline(this._loggedIn);
      } else {
        this._unload = this.renderHome();
      }
      break;
  }
};

FireTweetUI.prototype._postHandler = function(e) {
  var sparkText = $("#spark-input");
  var sparkButton = $("#spark-button");
  var containerEl = $("#spark-button-div");
  var message = $("<div>").addClass("msg").html("Posting...");

  var self = this;
  e.preventDefault();
  sparkButton.replaceWith(message);
  self._spinner.spin(containerEl.get(0));
  self._FireTweet.post(sparkText.val(), function(err, done) {
    if (!err) {
      message.html("Posted!").css("background", "#008000");
      sparkText.val("");
    } else {
      message.html("Posting failed!").css("background", "#FF6347");
    }
    self._spinner.stop();
    $("#c-count").val(self._limit);
    message.css("visibility", "visible");
    message.fadeOut(1500, function() {
      message.replaceWith(sparkButton);
      sparkButton.click(self._postHandler.bind(self));
    });
  });
};

FireTweetUI.prototype._handleNewSpark = function(listId, limit, func) {
  var self = this;
  func(
    limit,
    function(sparkId, spark) {
      spark.content = spark.content.substring(0, self._limit);
      spark.sparkId = sparkId;
      spark.friendlyTimestamp = self._formatDate(
        new Date(spark.timestamp || 0)
      );
      var sparkEl = $(Mustache.to_html($("#tmpl-spark").html(), spark)).hide();
      $("#" + listId).prepend(sparkEl);
      sparkEl.slideDown("slow");
    }, function(sparkId) {
      setTimeout(function() {
        $("#spark-" + sparkId).stop().slideToggle("slow", function() {
          $(this).remove();
        });
      }, 100);
    }
  );
};

FireTweetUI.prototype._formatDate = function(date) {
  var localeDate = date.toLocaleString();
  // Remove GMT offset if it's there.
  var gmtIndex = localeDate.indexOf(' GMT');
  if (gmtIndex > 0) {
    localeDate = localeDate.substr(0, gmtIndex);
  }
  return localeDate;
};

FireTweetUI.prototype._editableHandler = function(id, value) {
  if (id == "inputLocation") {
    this._FireTweet.setProfileField("location", value);
  }
  if (id == "inputBio") {
    this._FireTweet.setProfileField("bio", value);
  }
  return true;
};

FireTweetUI.prototype.onLoginStateChange = function(info) {
  this._spinner.stop();
  this._loggedIn = info;
  $("#header").html(Mustache.to_html($("#tmpl-page-header").html(), {user: this._loggedIn}));
  if (info) {
    this.renderTimeline(info);
  } else {
    this.renderHome();
  }
};

FireTweetUI.prototype.logout = function(e) {
  if (e) {
    e.preventDefault();
  }
  this._FireTweet.logout();
  this._loggedIn = false;
  this.renderHome();
};

FireTweetUI.prototype.render404 = function() {
  // TODO: Add 404 page.
  this.renderHome();
};

FireTweetUI.prototype.goHome = function() {
  this._go("/");
};

FireTweetUI.prototype.renderHome = function(e) {
  if (e) {
    e.preventDefault();
  }
  if (this._loggedIn) {
    return this.renderTimeline(this._loggedIn);
  }

  $("#header").html($("#tmpl-index-header").html());

  // Preload animation.
  var path = "img/curl-animate.gif";
  var img = new Image();
  img.src = path;

  // Setup curl on hover.
  $(".ribbon-curl").find("img").hover(function() {
    $(this).attr("src", path);
  }, function() {
    $(this).attr("src", "img/curl-static.gif");
  });

  var body = Mustache.to_html($("#tmpl-content").html(), {
    classes: "cf home", content: $("#tmpl-index-content").html()
  });
  $("#body").html(body);

  var self = this;
  var loginButton = $("#login-button");
  loginButton.click(function(e) {
    e.preventDefault();
    loginButton.css("visibility", "hidden");
    self._spinner.spin($("#login-div").get(0));
    self._FireTweet.login('facebook');
  });

  $("#about-link").remove();

  // Attach handler to display the latest 5 sparks.
  self._handleNewSpark(
    "spark-index-list", 5,
    self._FireTweet.onLatestSpark.bind(self._FireTweet)
  );
  return function() { self._FireTweet.unload(); };
};

FireTweetUI.prototype.renderSearch = function() {
  var self = this;
  $("#header").html(Mustache.to_html($("#tmpl-page-header").html(), {user: self._loggedIn}));
  // Render body.
  var content = Mustache.to_html($("#tmpl-search-content").html());
  var body = Mustache.to_html($("#tmpl-content").html(), {
    classes: "cf", content: content
  });
  $("#body").html(body);

  var searchInput = $("#search-input");
  var MAX_SEARCH_TERM_LENGTH = 20;
  self._FireTweet.startSearch(function(results) {
    var searchResultHtml = Mustache.to_html($('#tmpl-search-result').html(), {results: results});
    $('#search-result-list').html(searchResultHtml);
  });
  var onCharChange = function() {
    var searchTerm = searchInput.val();
    if (searchTerm.length > MAX_SEARCH_TERM_LENGTH) {
      searchTerm = searchTerm.substr(0, MAX_SEARCH_TERM_LENGTH)
      searchInput.val(searchTerm);
    }
    self._FireTweet.updateSearchTerm(searchTerm);
  };

  searchInput.keyup(onCharChange);
  searchInput.blur(onCharChange);

  return function() { self._FireTweet.unload(); };
};

FireTweetUI.prototype.renderTimeline = function(info) {
  var self = this;
  $("#header").html(Mustache.to_html($("#tmpl-page-header").html(), {user: self._loggedIn}));

  // Render placeholders for location / bio if not filled in.
  info.location = info.location.substr(0, 80) || "Your Location...";
  info.bio = info.bio.substr(0, 141) || "Your Bio...";

  // Render body.
  var content = Mustache.to_html($("#tmpl-timeline-content").html(), info);
  var body = Mustache.to_html($("#tmpl-content").html(), {
    classes: "cf", content: content
  });
  $("#body").html(body);

  // Attach textarea handlers.
  var charCount = $("#c-count");
  var sparkText = $("#spark-input");
  $("#spark-button").css("visibility", "hidden");
  function _textAreaHandler() {
    var text = sparkText.val();
    charCount.text("" + (self._limit - text.length));
    if (text.length > self._limit) {
      charCount.css("color", "#FF6347");
      $("#spark-button").css("visibility", "hidden");
    } else if (text.length == 0) {
      $("#spark-button").css("visibility", "hidden");
    } else {
      charCount.css("color", "#999");
      $("#spark-button").css("visibility", "visible");
    }
  }
  charCount.text(self._limit);
  sparkText.keyup(_textAreaHandler);
  sparkText.blur(_textAreaHandler);

  // Attach post spark button.
  $("#spark-button").click(self._postHandler.bind(self));

  // Attach new spark event handler, capped to 10 for now.
  self._handleNewSpark(
    "spark-timeline-list", 10,
    self._FireTweet.onNewSpark.bind(self._FireTweet)
  );

  // Get some "suggested" users.
  self._FireTweet.getSuggestedUsers(function(userid, info) {
    info.id = userid;
    $(Mustache.to_html($("#tmpl-suggested-user").html(), info)).
      appendTo("#suggested-users");

    //var button = $("#followBtn-" + userid);
    var button = $('.btn-follow');
    // Fade out the suggested user if they were followed successfully.
    button.click(function(e) {
      var $button = $(e.target);
      var id = $button.data('id');
      e.preventDefault();
      $button.remove();
      self._FireTweet.follow(id, function(err, done) {
        // TODO FIXME: Check for errors!
        $("#followBox-" + userid).fadeOut(1500);
      });
    });
  });

  // Make profile fields editable.
  $(".editable").editable(function(value, settings) {
    self._editableHandler($(this).attr("id"), value);
    return value;
  });
  return function() { self._FireTweet.unload(); };
};

FireTweetUI.prototype.renderProfile = function(uid) {
  var self = this;
  var facebookId = uid.replace('facebook:', '');
  $("#header").html(Mustache.to_html($("#tmpl-page-header").html(), {user: self._loggedIn}));

  // Render profile page body.
  $("#body").html(Mustache.to_html($("#tmpl-profile-body").html()));

  var followersLoaded = false;
  var followers = [];
  var renderFollowers = function() {
    $('#follower-profile-list').html(Mustache.to_html($('#tmpl-user-list').html(), {users: followers}));
  };

  var followeesLoaded = false;
  var followees = [];
  var renderFollowees = function() {
    $('#followee-profile-list').html(Mustache.to_html($('#tmpl-user-list').html(), {users: followees}));
  };

  // Update user info.
  self._FireTweet.getUserInfo(uid, function(info) {
    info.id = uid;
    var content = Mustache.to_html($("#tmpl-profile-content").html(), info);
    $("#profile-content").html(content);
    var button = $('.btn-follow');

    // Show follow button if logged in.
    if (self._loggedIn && self._loggedIn.id != info.id) {
      button.click(function(e) {
        var $clickedButton = $(e.target);
        var clickedButtonId = $clickedButton.data('id');
        e.preventDefault();

        self._FireTweet.follow(clickedButtonId, function(err, done) {
          // TODO FIXME: Check for errors!
          $clickedButton.fadeOut(1500);
        });
      });
    } else {
      button.hide();
    }
  }, /*onFollower=*/ function(newFollower) {
    followers.push(newFollower);
    if (followersLoaded) {
      renderFollowers();
    }
  }, /*onFollowersComplete=*/ function() {
    followersLoaded = true;
    renderFollowers();
  }, /*onFollowee=*/ function(newFollowee) {
    followees.push(newFollowee);
    if (followeesLoaded) {
      renderFollowees();
    }
  }, /*onFolloweesComplete=*/ function() {
    followeesLoaded = true;
    renderFollowees();
  });

  // Render this user's tweets. Capped to 5 for now.
  self._handleNewSpark(
    "spark-profile-list", 5,
    self._FireTweet.onNewSparkFor.bind(self._FireTweet, uid)
  );
  return function() { self._FireTweet.unload(); };
};

FireTweetUI.prototype.renderSpark = function(id) {
  var self = this;
  $("#header").html(Mustache.to_html($("#tmpl-page-header").html(), {user: self._loggedIn}));

  // Render spark page body.
  self._FireTweet.getSpark(id, function(spark) {
    if (spark !== null && spark.author) {
      self._FireTweet.getUserInfo(spark.author, function(authorInfo) {
        for (var key in authorInfo) {
          spark[key] = authorInfo[key];
        }
        spark.content = spark.content.substring(0, self._limit);
        spark.friendlyTimestamp = self._formatDate(
          new Date(spark.timestamp || 0)
        );
        var content = Mustache.to_html($("#tmpl-spark-content").html(), spark);
        var body = Mustache.to_html($("#tmpl-content").html(), {
          classes: "cf", content: content
        });
        $("#body").html(body);
      });
    }
  });
  return function() { self._FireTweet.unload(); };
};
