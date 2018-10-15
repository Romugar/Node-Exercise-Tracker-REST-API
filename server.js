const shortid = require("shortid");
const express = require("express");
var mongo = require("mongodb");
const app = express();
const bodyParser = require("body-parser");

const cors = require("cors");

const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URI);
var Schema = mongoose.Schema;

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Users schema and model

var Users = new Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  _id: {
    type: String,
    index: true,
    default: shortid.generate
  }
});

var userModel = mongoose.model("Users", Users);

// Exercise Schema and model

const Exercises = new Schema({
  description: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  username: String,
  userId: {
    type: String,
    ref: "Users",
    index: true
  }
});

var exerciseModel = mongoose.model("Exercises", Exercises);

// add user

function createAndSaveUser(user, callback) {
  var newUser = new userModel({
    username: user
  });
  newUser.save((err, data) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data);
    }
  });
}

function findUserByName(user, callback) {
  userModel.find({ username: user }, function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data[0]);
    }
  });
}

app.post("/api/exercise/new-user", function(req, res) {
  if (req.body.username !== "") {
    findUserByName(req.body.username, function(err, data) {
      if (err) {
        res.json({ error: err });
      }
      if (data === undefined) {
        createAndSaveUser(req.body.username, function(err, dat) {
          res.json({ username: dat.username, _id: dat._id });
        });
      } else {
        res.json({
          error: "user already exists",
          username: data.username,
          _id: data._id
        });
      }
    });
  } else {
    res.json({ error: "Username is required" });
  }
});

// get user list

function findAllUsers(callback) {
  userModel.find({}, function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data);
    }
  });
}

app.get("/api/exercise/users", function(req, res) {
  findAllUsers(function(err, data) {
    if (err) {
      console.log(err);
    }
    res.json(data);
  });
});

// add exercise

function createAndSaveExercise(
  userId,
  username,
  description,
  duration,
  date,
  callback
) {
  var newExercise = new exerciseModel({
    userId: userId,
    username: username,
    description: description,
    duration: duration,
    date: date
  });
  newExercise.save((err, data) => {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data);
    }
  });
}

function findUserById(userId, callback) {
  userModel.find({ _id: userId }, function(err, data) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data[0]);
    }
  });
}

app.post("/api/exercise/add", function(req, res) {
  if (
    req.body.userId !== "" &&
    req.body.description !== "" &&
    req.body.duration !== ""
  ) {
    findUserById(req.body.userId, function(err, data) {
      if (data === undefined) {
        res.json({ error: "the user doesn't exist" });
      } else {
        var regEx = /^\d{4}-\d{2}-\d{2}$/;
        if (req.body.date === "") {
          req.body.date = new Date();
          createAndSaveExercise(
            req.body.userId,
            data.username,
            req.body.description,
            req.body.duration,
            req.body.date,
            function(err, data) {
              res.json({
                _id: data.userId,
                username: data.username,
                description: data.description,
                duration: data.duration,
                date: data.date.toDateString()
              });
            }
          );
        } else {
          var d = new Date(req.body.date);
          if (!req.body.date.match(regEx)) {
            res.json({ error: "The date format must be YYYY-MM-DD" });
          } else if (Number.isNaN(d.getTime())) {
            res.json({ error: "The date is incorrect" });
          } else {
            createAndSaveExercise(
              req.body.userId,
              data.username,
              req.body.description,
              req.body.duration,
              req.body.date,
              function(err, data) {
                res.json({
                  _id: data.userId,
                  username: data.username,
                  description: data.description,
                  duration: data.duration,
                  date: data.date.toDateString()
                });
              }
            );
          }
        }
      }
    });
  } else {
    res.json({ error: "userId, description and duration are required" });
  }
});

// user exercise log

app.get("/api/exercise/log", function(req, res, next) {
  const from = new Date(req.query.from);
  const to = new Date(req.query.to);
  findUserById(req.query.userId, function(err, data) {
    if (err) return next(err);
    if (!data) {
      res.json({ error: "the user doesn´t exists" });
    }
    exerciseModel
      .find(
        {
          userId: req.query.userId,
          date: {
            $lt: to != "Invalid Date" ? to.getTime() : Date.now(),
            $gt: from != "Invalid Date" ? from.getTime() : 0
          }
        },
        {
          __v: 0,
          _id: 0
        }
      )
      .sort("-date")
      .limit(parseInt(req.query.limit))
      .exec((err, exercises) => {
        if (err) return next(err);
        const response = {
          _id: req.query.userId,
          username: data.username,
          from: from != "Invalid Date" ? from.toDateString() : undefined,
          to: to != "Invalid Date" ? to.toDateString() : undefined,
          count: exercises.length,
          log: exercises.map(e => ({
            description: e.description,
            duration: e.duration,
            date: e.date.toDateString()
          }))
        };
        res.json(response);
      });
  });
});

// Not found middleware
app.use((req, res, next) => {
  return next({ status: 404, message: "not found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
