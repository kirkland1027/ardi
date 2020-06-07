require('dotenv').config();
const Discord = require('discord.js');
const axios = require('axios');
const bot = new Discord.Client();
const express = require('express');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json()); // creates http server
const env = process.env;
const TOKEN = process.env.DISCORD_TOKEN;
var redis = require('redis');
var client = redis.createClient(6379, env.REDIS); //creates a new client
var usrHld = [];
var blockedUsers = [];
var token = env.TOKEN;


start();

client.on('connect', function(){
    console.log(`Reddis Connected: ${process.env.REDIS}`);
});



async function start(){
    usrHld = await getBLockedUsers();
    if (usrHld !== null && usrHld[0] !== undefined){
        for (var i=0; usrHld.length>i;i++){
            blockedUsers.push(usrHld[i]);
        }
    }
    console.log('Blocked Users:', blockedUsers)

    app.listen(3050, () => console.log(`[SUCCESS] [Ardi DISCORD ${env.VER}] Webhook is listening`));

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

        if (req.body.headers.action === 'reply'){
            var text = req.body.headers.data;
            if (text !== null) {
                var channel = req.body.headers.target;
                var len = text.length;
                var wait = ((len / 7.16) * 1000);
                sendReply(bot, channel, text, wait)
            } else { console.log('[ERROR] > TEXT IS NULL!'); }
        }

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
    

    bot.login(TOKEN)
    bot.on('ready', () => {
        console.log(`[SUCCESS][ARDI DISCORD ${env.VER}] Logged in as ${bot.user.tag}!`);
        //bot.channels.cache.get('707001583434465301').send('test')
    });


    bot.on('message', msg => {

        if(msg.content !== '!block' && msg.content !== '!unblock' && msg.author.bot === false && (!blockedUsers.includes(msg.author.id)) && (!msg.content.toLowerCase().includes('http')) && msg.attachments.size <= 0){
            //var content = msg.content.toLowerCase();
            var content = msg.content;
            notify(msg.author.username, msg.author.id, content, msg.channel.id, 'message'); 
        }

        if(msg.content == '!block'){
            if (!blockedUsers.includes(msg.author.id)){
                blockedUsers.push(msg.author.id);
                console.log('[ALERT] User blocked:', msg.author.username);
                userAction(msg.author.username, msg.author.id, 'block');
                msg.reply('Your ID has been set to ignore. I will no longer use your public conversations to help with understanding natural language. You can change your mind at anytime by typing !unblock');
            }
            else{
                msg.reply('Your ID has already been set to ignore. You can change your mind at anytime by typing !unblock');
            }
            
            

        }
        if(msg.content === '!unblock'){
            var index = blockedUsers.indexOf(msg.author.id);
            if (index !== -1) blockedUsers.splice(index, 1);
            console.log('[SUCCESS] User unblocked:', msg.author.username)
            userAction(msg.author.username, msg.author.id, 'unblock')
            msg.reply('Thank you! Your public conversations will help me better understand natural language! You can change your mind at any time by typing !block');
        }
        if(msg.content === '!help'){

        }
    });


    
    
}


function notify(sender, id, message, channelid, type){
    axios.post(process.env.SORT + process.env.TOKEN, {
        headers: {
            action: type,
            author: sender,
            userid: id,
            channel: channelid,
            data: message,
        }
    })
    .catch(error => {
        console.error(error)
    });
}
function userAction(sender, id, type){
    axios.post(process.env.SORT + process.env.TOKEN, {
        headers: {
            action: type,
            author: sender,
            userid: id
        }
    })
    .catch(error => {
        console.error(error)
    });
}

function getBLockedUsers(){
    //for (var i=0;results.length>i;i++)
    return new Promise((resolve, reject) => {
        client.lrange('blocked_user', 0, -1, function(err, results){
            if (err) console.error(err);
            if (results !== null){
                return resolve(results);
            } else {
                return resolve(null);
            }
        })
    })
    
}

async function sendReply(bot, channel, text, wait){
    var slep = 750;
    await sleep(slep);
    bot.channels.cache.get(channel).startTyping();
    await sleep(wait);
    bot.channels.cache.get(channel).send(text);
    bot.channels.cache.get(channel).stopTyping();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}