/**
 * Spencer, 2017
 *
 * This code uses and connects to the Slack API, a rest API created by Slack. All operations which occur past the request stage are not done by me.
 */

/**
 * EventEmitter is provided by the language
 */
const EventEmitter = require('events');

/**
 * config.js is set up and maintained by me
 */
const config  = require('../config/');

/**
 * Request module is an open source node module.
 * It is developed by many users since anyone can provide contributions
 * Publishers include simov, fredkschott, nylen, mikeal
 */
const request = require('request');

/**
 * This method takes args and a slack method, and creates a request URL based upon it.
 * It will automatically stringify where necessary.
 * @param method
 * @param args
 * @returns {string}
 */
function createSlackRequestUrl(method, args = {}){
    let base_url = config.base_url+method;
    let args     = [];

    for(let property of Object.keys(args)){
        let value = args[property];
        if(typeof value != 'string'){
            value = JSON.stringify(value);
        }
        args.push(`${property}=${encodeURIComponent(value)}`);
    }

    return `${base_url}?${args.join('&')}`;
}

/**
 * This method makes a slack request and handles all errors.
 * @param url
 * @param args
 * @param callback
 */
function makeRequest(url, args = {}, callback = ()=>{}){
    // Callback is (<Boolean>success, <?>result)
    request({url: createSlackRequestUrl(url, args), json: true}, (err, res, body)=>{
        // If there's a request error/response statusCode that isn't 200, callback(false, [err])
        if(err)                   return callback(err);
        if(res.statusCode != 200){
            if(body.error){
                return callback(body.error);
            }else{
                return callback(res.statusCode);
            }
        }

        // If body.ok is false then we tell them that all is not ok
        // and give them the error in the body.
        if(!body.ok)              return callback(body.error);

        // Otherwise it's good to go
        callback(null, body);
    });
}

/**
 * frozor-websocket is a node module developed entirely by me.
 * This module uses another module I created (frozor-logger).
 * In addition, this module uses a node module called "websocket",
 * which is open sourced and therefore has an astronomical amount
 * of contributors, but the user "theturtle32" is its singular
 * publisher.
 */
const WebSocket    = require('frozor-websocket');

class SlackRTM extends EventEmitter{
    constructor(token, prefix){
        super();
        this.token  = token;

        let socketPrefix = `${(prefix)?`${prefix}|`:''}RTM`;

        this.socket = new WebSocket({
            prefix: socketPrefix,
            name  : 'RTM'||prefix,
            json  : true
        });
    }

    start(){
        makeRequest('rtm.start', {token: this.token}, (err, result)=>{
            if(err) return this.emit('requestFail', result);

            //Emit that the request is a success
            this.emit('requestSuccess');

            //Emit the data we got for anyone who wants listen
            this.emit('orgData', {
                self     : result.self,
                team     : result.team,
                users    : result.users,
                channels : result.channels,
                groups   : result.groups,
                mpims    : result.mpims,
                ims      : result.ims,
                bots     : result.bots
            });

            //Connect to the socket
            this.socket.connect(result.url);

            //Tell people when there's a new event, obviously...
            this.socket.on('message', (event)=>{
                if(event.type == 'reconnect_url') this.socket.options.reconnect_url = event.url;
                this.emit('event', event.type, event);
            });
        });
    }
}

function SlackObject(name, id){
    this.name = name;
    this.id = id;
}

class SlackAPI extends EventEmitter{
    constructor(token, prefix){
        super();
        this.token   = token;
        this.prefix  = prefix;

        this.cache   = {};

        let getIdBasedObjectStorage = (name)=>{
            let plural = `${name}s`;

            return {
                create: () => {
                    if (!this.cache.hasOwnProperty(plural)) this.cache[plural] = {}
                },
                get: (id, cb) => {
                    this.storage[plural].create();

                    if (this.cache[plural].hasOwnProperty(id)) return cb(null, this.cache[plural][id]);

                    let reqOptions = {};
                    reqOptions[name] = id;

                    this.methods[plural].info(reqOptions, (err, res) => {
                        if (err) return cb(err);

                        this.cache[plural][res[name].id] = res[name];

                        cb(this.cache[plural][res[name].id]);
                    });
                },
                save: (idObj) => {
                    this.storage[plural].create();
                    this.cache[plural][idObj.id] = idObj;
                },
                all: (cb) => {
                    this.storage[plural].create();

                    if (this.cache.hasOwnProperty('plural')) cb(null, this.cache[plural]);

                    this.methods[plural].list((err, res) => {
                        if (err) return cb(err);

                        for (let idObj of res) {
                            this.storage[plural].save(idObj);
                        }

                        cb(null, this.cache[plural]);
                    });
                }
            }
        };

        this.storage = {
            self: {
                get:(cb)=>{
                    if(this.cache.hasOwnProperty('self')) return cb(null, this.cache.self);

                    this.methods.auth.test((err)=>{
                        if(err) return cb(err);

                        cb(null, this.cache.self);
                    });
                },
                save: (user)=>{
                    this.cache.self = user;
                }
            },
            team: {
                get:(cb)=>{
                    if(this.cache.hasOwnProperty('team')) return cb(null, this.cache.team);

                    this.methods.auth.test((err)=>{
                        if(err) return cb(err);

                        cb(null, this.cache.team);
                    });
                },
                save: (team)=>{
                    this.cache.team = team;
                }
            },
            users    : getIdBasedObjectStorage('user'),
            channels : getIdBasedObjectStorage('channel'),
            groups   : getIdBasedObjectStorage('group')
        };

        this.rtm     = new SlackRTM(token, this.prefix);
        this.methods = { rtm: this.rtm };

        this.rtm.on('event', (type, data)=>{
            this.emit(type, data);
            this.emit('event', type, data);
        });

        this.rtm.on('orgData', (data)=>{
            this.storage.self.save(data.self);
            this.storage.team.save(data.team);

            for(let user of data.users){
                this.storage.users.save(user);
            }

            for(let channel of data.channels){
                this.storage.channels.save(channel);
            }

            for(let group of data.groups){
                this.storage.groups.save(group);
            }

            this.emit('orgData', data);
        });

        this.on('team_join', (data)=>{
            this.storage.users.save(data.user);
        });
        this.on('channel_created', (data)=>{
            this.storage.channels.save(data.channel);
        });
        this.on('group_joined', (data)=>{
            this.storage.groups.save(data.channel);
        });

        // TODO: Implement 'goodbye' handling

        this.rtm.on('requestFail', (err)=> this.emit('rtmFail', err));

        this.rtm.socket.on('close', (code, desc)=> this.emit('rtmClose', code, desc));
        this.rtm.socket.on('connectFailed', ()=> this.emit('rtmConnectFailed'));
        this.rtm.socket.on('error', (error)=> this.emit('rtmError', error));

        for(let methodName of config.methods){
            let method = methodName.split('.');
            let apiObj = this.methods;

            for(let i = 0; i < method.length; i++){
                if(!apiObj[method[i]]) apiObj[method[i]] = {};

                if(i == method.length-1){
                    apiObj[method[i]] = (args = {}, cb = ()=>{})=>{
                        if(typeof args == 'function') {
                            //noinspection JSValidateTypes
                            cb   = args;
                            args = {};
                        }

                        args.token = this.token;

                        makeRequest(methodName, args, cb);
                    };
                    break;
                }else apiObj = apiObj[method[i]];
            }
        }

        this.methods.auth.test = (args = {}, cb = ()=>{})=>{
            if(typeof args == 'function') {
                //noinspection JSValidateTypes
                cb   = args;
                args = {};
            }

            args.token = this.token;

            makeRequest('auth.test', args, (err, res)=>{
                if(err) return cb(err);

                if(!this.cache.hasOwnProperty('self')) this.storage.self.save(new SlackObject(res.user, res.user_id));
                if(!this.cache.hasOwnProperty('team')) this.storage.team.save(new SlackObject(res.team, res.team_id));

                cb(null, res);
            });
        };

        this.methods.chat.postMessage = (args = {}, cb = ()=>{})=>{
            if(typeof args == 'function') {
                //noinspection JSValidateTypes
                cb   = args;
                args = {};
            }

            if(!args.text) throw new Error("Text is required in chat.postMessage");

            args.token = this.token;

            if(args.text.length > 2999){
                let queue = [];
                let msg   = args.text;

                while(msg.length > 2999){
                    queue.push(msg.substr(0, 3000));
                    msg = msg.substr(3000);
                }

                function next() {
                    args.text = queue.shift();
                    makeRequest('chat.postMessage', args, (err, res)=>{
                        if(err) return cb(err, res);

                        if(queue.length > 0) next();
                        else cb(null, res);
                    });
                }

                next();
            }else makeRequest('chat.postMessage', args, cb);
        }
    }
}

/* END SLACK API */

/* START SLACK TESTING */

const log      = new (require('frozor-logger'))('TEST');
const slackBot = new SlackAPI(MY_TOKEN, 'TESTBOT');

let tests = [
// Message Sending
    // Regular message, no as_user, with text
    ()=> slackBot.methods.chat.postMessage({ text: 'This is a regular, text-based message.' }),

    // Regular message, with as_user, with text
    ()=> slackBot.methods.chat.postMessage({ text: 'This is a message with as_user set to true, displaying parameter behavior.', as_user: true }),

    // Regular message with attachments
    //TODO: Add one
    ()=> slackBot.methods.chat.postMessage(),

    // Message with callback handling, for more advanced usage
    //TODO: Add handling and text and stuff
    ()=> slackBot.methods.chat.postMessage(),

// RTM Connection
    ()=>{
        // Initializing RTM connection
        slackBot.methods.rtm.start();

        // Receiving hello event
        slackBot.on('hello', ()=>{
            log.info('Slack just said hello, we\'re connected!');
        });

        // Receiving the message event, parsing it
        slackBot.on('message', ()=>{

        });

        return 30;
    },

// Storage
    // Self lookup

    // User lookup

    // Channel lookup
];

const defaultTimeDelay = 5000;

function doTest() {
    if(tests.length){
        let timeToDelay = tests.shift()() || defaultTimeDelay;

        setTimeout(doTest, timeToDelay);
    }
}

setTimeout(doTest, defaultTimeDelay);