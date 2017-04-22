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
 * @param argObject
 * @returns {string}
 */
function createSlackRequestUrl(method, argObject = {}){
    let base_url = config.base_url+method;
    let args     = [];

    for(let property of Object.keys(argObject)){
        let value = argObject[property];
        if(typeof value !== 'string' && typeof value !== 'number'){
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
        if(err){
            return callback(err);
        }

        if(res.statusCode !== 200){
            if(body.error){
                return callback(body.error);
            }else{
                return callback(res.statusCode);
            }
        }

        // If body.ok is false then we tell them that all is not ok
        // and give them the error in the body.
        if(!body.ok){
            return callback(body.error);
        }

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
                if(event.type === 'reconnect_url') this.socket.options.reconnect_url = event.url;
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

        const doesStorageExist = (name)=>{
            return this.cache.hasOwnProperty(name);
        }

        const createStorageIfNotExists = (name)=>{
            if(!doesStorageExist(name)){
                this.cache[name] = {};
            }
        }

        const getIdBasedObjectStorage = (storageName)=>{
            let storagePlural = `${storageName}s`;

            return {
                create: () => {
                    createStorageIfNotExists(storagePlural);
                },
                get: (id, cb) => {
                    this.storage[storagePlural].create();

                    if (this.cache[storagePlural].hasOwnProperty(id)) return cb(null, this.cache[storagePlural][id]);

                    let reqOptions = { [storageName]: id };

                    this.methods[storagePlural].info(reqOptions, (err, res) => {
                        if (err) return cb(err);

                        this.cache[storagePlural][res[storageName].id] = res[storageName];

                        cb(this.cache[storagePlural][res[storageName].id]);
                    });
                },
                findInCache: (predicate)=>{
                    this.storage[storagePlural].create();

                    if(!doesStorageExist(storagePlural)){
                        return null;
                    }

                    for(let obj of this.cache[storagePlural]){
                        if(predicate(obj)){
                            return obj;
                        }
                    }

                    return null;
                },
                save: (idObj) => {
                    this.storage[storagePlural].create();

                    this.cache[storagePlural][idObj.id] = idObj;
                },
                all: (cb) => {
                    this.storage[storagePlural].create();

                    if (this.cache.hasOwnProperty(plural)) cb(null, this.cache[storagePlural]);

                    this.methods[storagePlural].list((err, res) => {
                        if (err) return cb(err);

                        for (let idObj of res) {
                            this.storage[storagePlural].save(idObj);
                        }

                        cb(null, this.cache[storagePlural]);
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

                if(i === method.length-1){
                    apiObj[method[i]] = (args = {}, cb = ()=>{})=>{
                        if(typeof args === 'function') {
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
            if(typeof args === 'function') {
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
            if(typeof args === 'function') {
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
const slackBot = new SlackAPI(process.env.SLACK_TOKEN, 'TEST');

const channel = 'general';

let tests = [
// Message Sending
    // Regular message, no as_user, with text
    ()=> slackBot.methods.chat.postMessage({ channel , text: 'This is a regular, text-based message.' }),

    // Regular message, with as_user, with text
    ()=> slackBot.methods.chat.postMessage({ channel , text: 'This is a message with as_user set to true, displaying parameter behavior.', as_user: true }),

    // Regular message with attachments
    ()=> slackBot.methods.chat.postMessage({ channel, text: 'This is an attachment message.', attachments: [ {"title":"I'm an attachment","color":"#2196F3","text":"I'm attachment text"} ] }),

    // Message with callback handling and message editing, for more advanced usage
    ()=> slackBot.methods.chat.postMessage( { channel, text: 'This is a message with callback handling' }, function handleCallback(err, response) {
        if(err){
            log.error(`Request ran into an error: ${err}`);
        }else{
            setTimeout(()=> slackBot.methods.chat.update({ ts: response.ts, text: "I've handled the callback, and used it to edit the message!" }), 1000);
        }
    }),

// RTM Connection
    // This is all one test because RTM has to be in the same "branch" to work properly.
    ()=>{
        // Initializing RTM connection
        slackBot.methods.rtm.start();

        // Logging events
        slackBot.on('event', (event)=>{
            log.debug(`I just received a ${log.chalk.yellow(event)} event!`);
        });

        // Receiving hello event
        slackBot.on('hello', ()=>{
            log.info('Slack just said hello, we\'re connected!');
        });

        // Receiving the message event, parsing it, and responding to it upon certain conditions (async)
        slackBot.on('message', (data)=>{
            if(data.text.toLocaleLowerCase().includes('hello')){
                slackBot.methods.chat.postMessage({ channel: data.channel, text: `Hey there <@${data.user}>!` })
            }
        });

        return 15;
    },

    // This just unregisters listeners.
    ()=>{
        slackBot.removeAllListeners('event');
        slackBot.removeAllListeners('hello');
        slackBot.removeAllListeners('message');

        // Return 0 to start the next test immediately, since this one doesn't need to wait
        return 0;
    },

// Storage
    // Self lookup
    ()=>{
        slackBot.storage.self.get((err, self)=>{
            if(err){
                log.error(`Unable to get self info: ${log.chalk.red(err)}`);
            }else{
                log.info('');
                log.info(log.chalk.green('Storage.Self'));
                log.info('-----------');
                log.info(`Name: ${log.chalk.cyan(self.name)}`);
                log.info(`ID: ${log.chalk.cyan(self.id)}`);
                log.info(`Created: ${log.chalk.cyan(new Date(self.created*1000).toLocaleString())}`);

                const emojiUse = JSON.parse(self.prefs.emoji_use);
                let emojiTopUse = [undefined, 0];
                for(let emoji of Object.keys(emojiUse)){
                    if(emojiUse[emoji] > emojiTopUse[1]){
                        emojiTopUse = [emoji, emojiUse[emoji]];
                    }
                }

                log.info(`Most Used Emoji: ${log.chalk.cyan(emojiTopUse[0])}`);

                log.info('');
            }
        })
    },

    // User lookup when you know the name and not the id
    ()=>{
        let lookupUsername = 'jake861';
        let lookupUser = slackBot.storage.users.findInCache((u)=> u.name === lookupUsername);

        log.info('');
        if(lookupUser !== null){
            log.info(log.chalk.green('Storage.Users.Jake861'));
            log.info('-----------');
            log.info(`Name: ${log.chalk.cyan(user.name)}`);
            log.info(`ID: ${log.chalk.cyan(user.id)}`);
            log.info(`Enabled: ${(user.deleted) ? log.chalk.red('No') : log.chalk.green('Yes')}`);
        }else{
            log.info(`Could not find the user ${log.chalk.cyan('jake861')} in cache.`);
        }
        log.info('')
    }

    // Channel lookup
];

const defaultTimeDelay = 5000;

log.info('Starting tests...');

const testCount = tests.length;
let testPlace = 0;

function doTest() {
    if(tests.length){
        testPlace++;
        log.info(`Starting test ${log.chalk.red(testPlace)}/${log.chalk.magenta(testCount)}`);
        let timeToDelay = tests.shift()();
        if(timeToDelay == null || !timeToDelay){
            timeToDelay = defaultTimeDelay;
        }

        setTimeout(doTest, timeToDelay);
    }else{
        log.info('All done with tests!');
        process.exit();
    }
}

doTest();