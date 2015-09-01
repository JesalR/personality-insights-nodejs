/**
* Copyright 2015 IBM Corp. All Rights Reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

'use strict';

var express  = require('express'),
app        = express(),
bluemix    = require('./config/bluemix'),
watson     = require('watson-developer-cloud'),
extend     = require('util')._extend,
rateLimit  = require('./config/captcha-rate-limit')(app),
i18n       = require('i18next'),
ibmdb      = require('ibm_db');
var fs = require('fs');

//i18n settings
require('./config/i18n')(app);

// Bootstrap application settings
require('./config/express')(app);

// if bluemix credentials exists, then override local
var credentials = extend({
  version: 'v2',
  password: "2GSUxt2jrPwC",
  url: "https://gateway.watsonplatform.net/personality-insights/api",
  username: "dc4a044b-df53-4d92-b7c5-35c317d93377"
}, bluemix.getServiceCreds('personality_insights')); // VCAP_SERVICES

// Create the service wrapper
var personalityInsights = watson.personality_insights(credentials);

// render index page
app.get('/', function(req, res) {
  res.render('index');
});

var db2;
if (process.env.VCAP_SERVICES) {
  var env = JSON.parse(process.env.VCAP_SERVICES);
  db2 = env['sqldb'][0].credentials;
}
else {
  db2 = {
    db: "SQLDB",
    host: "75.126.155.153",
    hostname: "75.126.155.153",
    jdbcurl: "jdbc:db2://75.126.155.153:50000/SQLDB",
    password: "42ucCMfrk0MM",
    port: 50000,
    uri: "db2://user07717:42ucCMfrk0MM@75.126.155.153:50000/SQLDB",
    username: "user07717"
  };
}
var connString = "DRIVER={DB2};DATABASE=" + db2.db + ";UID=" + db2.username + ";PWD=" + db2.password + ";HOSTNAME=" + db2.hostname + ";port=" + db2.port;


app.get('/lines', function(req,res){
  var linedict = {}
  fs.readFile(__dirname+'/input/lines.tsv', 'utf8', function (err,data) {
    if (err) {
      return console.log(err);
    }
    var lines = data.split("\n")
    ibmdb.open(connString, function (err, conn) {
      if (err) {
        return console.log(err);
      }else{
        console.log("HELLO DATABASE")
      }
      lines.forEach(function(l){
        var line = l.split("\t")
        var content = line[3]
        if(line[1] != undefined && lines[1] != "" && lines[1] != "-"){
          var characters = line[1].split(",")
          characters.forEach(function(c){
            if(linedict[c] != undefined){
              linedict[c] = linedict[c] + ' ' + content;
            }else{
              linedict[c] = content;
            }
          })
        }
      })
      for(var chars in linedict){
        var query = "UPDATE CHARACTER SET LINES = '"+linedict[chars]+"' WHERE id = "+chars+";"
        conn.query(query, function (err, rows, moreResultSets) {
          if (err) {
            console.log(err);
          } else {

            console.log(rows);
          }
        })
      }
    })
  })
})

app.get('/personalities', function(req,res){
  ibmdb.open(connString, function (err, conn) {
    if (err) {
      return console.log(err);
    }else{
      console.log("HELLO DATABASE")
    }
    var query = "SELECT * FROM CHARACTER WHERE JSON IS NULL;"
    conn.query(query, function (err, rows, moreResultSets) {
      if (err) {
        console.log(err);
      } else {
        var count = 0;
        rows.forEach(function(record){
          var parameters = {}
          parameters.recaptcha = ''
          parameters.language = 'en'
          parameters.acceptLanguage = 'en-GB'
          parameters.text = record.LINES
          if(count >= 0){
            personalityInsights.profile(parameters, function(err, profile) {
              if (!err)
                profile = JSON.stringify(profile)
                var query2 = "UPDATE CHARACTER SET JSON = '"+profile+"' WHERE id = "+record.ID+";"
                conn.query(query2, function (err2, rows2, moreResultSets2) {
                  if (err2) {
                    console.log(err2);
                  } else {
                    console.log(rows2);
                  }
                })
            });
          }
          count++;
        })
      }
    })
  })
})

app.get('/blank', function(req,res){
  ibmdb.open(connString, function (err, conn) {
    if (err) {
      return console.log(err);
    }else{
      console.log("HELLO DATABASE")
    }
    var query = "DELETE FROM CHARACTER WHERE ID >= 25;"
    conn.query(query, function (err, rows, moreResultSets) {
      if (err) {
        console.log(err);
      } else {

      }
    })
  })
})

app.get('/characters', function(req,res){
  ibmdb.open(connString, function (err, conn) {
    if (err) {
      return console.log(err);
    }else{
      console.log("HELLO DATABASE")
    }
    var query = "SELECT ID, NAME FROM CHARACTER;"
    conn.query(query, function (err, rows, moreResultSets) {
      if (err) {
        console.log(err);
      } else {
        return res.json(rows)
      }
    })
  })
})

// 1. Check if we have a captcha and reset the limit
// 2. pass the request to the rate limit
app.post('/', function(req, res, next) {
  var parameters = extend(req.body, { acceptLanguage : i18n.lng() });
  ibmdb.open(connString, function (err, conn) {
    if (err) {
      return console.log(err);
    }else{
      console.log("HELLO DATABASE")
    }
    var query = "SELECT JSON FROM CHARACTER WHERE ID="+parameters.text+";"
    conn.query(query, function (err, rows, moreResultSets) {
      if (err) {
        console.log(err);
      } else {
        console.log(rows[0].JSON)
        return res.json(rows[0].JSON)
      }
    })
  })
});

// error-handler settings
require('./config/error-handler')(app);

var port = process.env.VCAP_APP_PORT || 3000;
app.listen(port);
console.log('listening at:', port);
