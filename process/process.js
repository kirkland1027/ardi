//data sorting application
'use strict';
require('dotenv').config();
var redis = require('redis');
var mysql = require('mysql');
const express = require('express');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json()); // creates http server
const env = process.env;
var token = env.TOKEN;

var client = redis.createClient(6379, env.REDIS); //creates a new client
//var messages = redis.createClient(6379, env.REDIS); //creates a new client

client.on('connect', function(){
    console.log(`[SUCCESS] > Reddis Connected: ${process.env.REDIS}`);
    console.log(`[SUCCESS] > SQL DB: ${process.env.ARDI_DB}`);
});

// start the webhook
app.listen(3054, () => console.log(`[SUCCESS] [Ardi PROCESS ${env.VER}] Webhook is listening`));

//l1db01 mySQL
var sqlPool = mysql.createPool({
    host: env.SQL_HOST,
    user: env.ARDI_USER,
    password: env.ARDI_PW,
    database: env.ARDI_DB
});
  
app.get('/', (req, res) => {
    // check if verification token is correct
    if (req.query.token !== token) {
        return res.sendStatus(401);
    } 
    // return challenge
    return res.end(req.query.challenge);
});

app.post('/', (req, res) => {
    // check if verification token is correct
    if (req.query.token !== token) {
        console.log(req.query);
        console.log('401');
        return res.sendStatus(401);
    }

    var sqlTable = req.body.headers.did;
    var uuid = req.body.headers.id;
    var tableCode = req.body.headers.codes;
    processPosPositionData(tableCode, uuid);
    


// return a text response
    const data = {
        responses: [
        {
            type: 'text',
            elements: ['Status', 'Received']
        }]
    };

    res.json(data);
});

//function to store sql information



async function processPosPositionData(table, uuid){
  var tbl = table;
  var posCode = await getPosCode(uuid);
  var posWords = await getPosWords(uuid);
  var wordsArr = posWords.split(',');
  var posArray = posCode.split(',');
  for (var i=0; posArray.length>i;i++){
    var getPosStatsExists = await getPosStats(tbl, posArray[i], i, wordsArr[i]);
    var occCnt = await getPosOccuranceStats(tbl, posArray[i], i, wordsArr[i]);
    if (!getPosStatsExists){
      console.log('[SUCCESS] > New Occurrence Percentage:', occCnt);
      storePositionOccurance(occCnt, posArray[i], i, table, 'I', wordsArr[i]);
    }
  }
  updatePositionOccurance();
  processCodeData(table, uuid);
}

function getPosCode(uuid){
  return new Promise((resolve, reject) => {
    client.hgetall(uuid, function(err, results){
      if (err) console.error(err);
      if (results !== null) return resolve(results.pos);
      console.log('[ERROR] > No Results Found!')
      return resolve(null);
    })
  })
}

async function processCodeData(table, uuid){
  var lgn = await getAvgLength(table);
  var topPos = await getCodeTopPOS(table);
  
  var codeStatExists = await getCodeExists(table);
  if (!codeStatExists){
    console.log('[INFO] [NEW] > Top POS:', topPos, 'Average Lgenth:', lgn);
    var sql = "INSERT INTO code_stats (code, top_pos, avg_length) VALUES ('" + table + "', '" + topPos + "', '" + lgn + "')";
    sqlStore(sql);
  }
  else {
    console.log('[INFO] [UPDATE] > Top POS:', topPos, 'Average Lgenth:', lgn);
    var sql = "UPDATE code_stats SET top_pos='" + topPos + "', avg_length='" + lgn + "' WHERE code='" + table + "'";
    sqlStore(sql);
  }
}

function getPosWords(uuid){
  return new Promise((resolve, reject) => {
    client.hgetall(uuid, function(err, results){
      if (err) console.error(err);
      if (results !== null) return resolve(results.words);
      console.log('[ERROR] > No Results Found!')
      return resolve(null);
    })
  })
}

function getPosStats(tbl, pos, posNum, word){
  return new Promise((resolve, reject) => {
    var sql = "SELECT * FROM pos_stats WHERE code='" + tbl + "' AND pos='" + pos + "' AND pos_position='" + posNum + "' AND word='" + word + "'";
    readSqlQuery(sql, function(err, results){
      if (err) console.error(err);
      if (results !== null && results[0] !== undefined) return resolve(true);
      return resolve(false);
    })
  })
}

function getPosOccuranceStats(tbl, pos, j, word){
  return new Promise((resolve, reject) => {
    var sql = "SELECT * FROM coding WHERE code='" + tbl + "' ORDER BY id DESC";
    readSqlQuery(sql, function(err, results){
      if (err) console.error(err);
      var count = 0;
      for (var i=0;results.length>i;i++){
        var posCode = results[i].pos;
        var posCodeArr = posCode.split(',');
        var position = posCodeArr.indexOf(pos);
        var sent = results[i].data;
        if (posCodeArr.includes(pos) && position === j && sent.includes(word)){
          count++;
        } 
      }
      var posAvg = (count / results.length);
      if (posAvg>0) return resolve(posAvg);
      return resolve('1.0');
    })
  })
}

function getCodeExists(table){
  return new Promise((resolve, reject) => {
    var sql = "SELECT * FROM code_stats WHERE code='" + table + "'";
    readSqlQuery(sql, function(err, result){
      if (err) console.error(err);
      if (result !== null && result[0] !== undefined) return resolve(true);
      return resolve(false);
    })
  })
}

function getCodeTopPOS(table){
  return new Promise((resolve, reject) => {
    var sql = "SELECT pos, COUNT(*) FROM coding WHERE code='" + table + "' GROUP BY pos ORDER BY COUNT(*) DESC LIMIT 1"
    readSqlQuery(sql, function(err, result){
      if (err) console.error(err);
      if (result !== null && result[0] !== undefined) return resolve(result[0].pos);
      return resolve(null);
    })
  })
}

function getAvgLength(table){
  return new Promise((resolve, reject) =>{
    var sql = "SELECT ROUND(AVG(length),0) AS average FROM coding WHERE code='" + table + "'";
    readSqlQuery(sql, function(err, result){
      if (err) console.error(err);
      if (result !== null && result[0] !== undefined) return resolve(result[0].average)
      return resolve(null);
    })
  })
}

function storePositionOccurance(avg, pos, wordNum, table, action, word){
  if (action === 'I'){
    var sql = "INSERT INTO pos_stats (code, pos, pos_position, pos_occurance, word) VALUES ('" + table + "', '" + pos + "', '" + wordNum + "', '" + avg + "', '" + word + "')";
  }
  else{
    var sql = "UPDATE pos_stats SET pos_occurance='" + avg + "' WHERE code='" + table + "' AND pos='" + pos + "' AND pos_position='" + wordNum + "' AND word='" + word + "'";
  }
  sqlStore(sql);
}

function updatePositionOccurance(){
  var sql = "SELECT * FROM pos_stats ORDER BY id DESC";
  readSqlQuery(sql, async function(err, results){
    if (err) console.error(err);
    for (var ij=0;results.length>ij;ij++){
      var tblCode = results[ij].code;
      var pos = results[ij].pos.toString();
      var posPost = Number(results[ij].pos_position);
      var word = results[ij].word;
      var rslt = await getPosOccuranceStats(tblCode, pos, posPost, word);
      console.log('[INFO] > Updated:', results[ij].code, word, results[ij].pos, results[ij].pos_position, rslt)
      var sql = "UPDATE pos_stats SET pos_occurance='" + rslt + "' WHERE code='" + results[ij].code + "' AND pos='" + results[ij].pos + "' AND pos_position='" + results[ij].pos_position + "' AND word='" + word + "'";
      sqlStore(sql);
    }
  })
}


//function to store sql information
function sqlStore(sql){
  sqlPool.getConnection(function(err, connection) {
        connection.query(sql, function(err){
            if (err) throw err;
        });
        connection.release();
    })
}

function readSqlQuery(sql, callback) {
  sqlPool.getConnection((err, connection) => {
    if (err) {
        console.log(err);
        connection.release();
        callback(err.code, null);
    }
    connection.query(sql,  (err, results) => {
        connection.release();
        if (!err) {
            callback(null, results);
        }
        else {
            callback(err.code, null);
        }
    });
  });
}



