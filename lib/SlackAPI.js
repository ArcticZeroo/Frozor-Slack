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

                    for(let id in this.cache[storagePlural]){
                        if(this.cache[storagePlural].hasOwnProperty(id)){
                            let obj = this.cache[storagePlural][id];
                            if(predicate(obj)){
                                return obj;
                            }
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

                queue.push(msg);

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
    ()=> slackBot.methods.chat.postMessage({ channel , text: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam sem turpis, volutpat et tellus id, dapibus malesuada quam. Nulla eu nunc tempus, lacinia augue nec, gravida ante. Aenean ultrices, ipsum ut tristique venenatis, ligula mauris bibendum odio, vel lobortis arcu ipsum et mi. Proin felis leo, porta ut diam consectetur, tristique consectetur velit. Proin mauris dui, condimentum vel feugiat non, tincidunt sit amet dui. Nullam a tortor non lacus tincidunt mattis vel a nunc. Quisque semper, libero sed scelerisque feugiat, diam quam malesuada nisi, eu luctus justo mi vel dolor. Vestibulum dui magna, volutpat a posuere non, euismod eget leo. Sed purus quam, maximus non feugiat et, finibus eget sapien. Duis eget magna id nisl ultrices ullamcorper. Donec ornare eros eget urna condimentum, eget convallis dui tincidunt. Morbi vulputate nisl ac nulla congue, vestibulum euismod est luctus. Vivamus eget consequat arcu. Nunc vitae aliquam tellus. Curabitur sem justo, venenatis id consequat nec, suscipit id libero. Integer consectetur diam luctus hendrerit venenatis.

In ultrices augue nec massa dignissim, id pulvinar ante pellentesque. Cras eu sem eu quam condimentum vestibulum. Curabitur dignissim, ligula vel pellentesque feugiat, lacus enim pretium lorem, a consectetur libero felis ac nisi. Etiam in tincidunt velit. Donec ac nunc sed orci sagittis luctus. Fusce commodo iaculis erat, fringilla bibendum eros ornare id. Maecenas congue mauris eu ex rhoncus facilisis. Integer eleifend orci turpis, ut mollis enim consequat eu. Nullam feugiat est non orci consequat fermentum. Aenean euismod, nibh sit amet congue bibendum, sapien felis ullamcorper sapien, quis tempus diam tortor ut lacus. Duis pellentesque non est vitae molestie. Nulla in pretium dolor, nec tincidunt enim. Fusce at pharetra felis. Curabitur eget condimentum orci, non suscipit magna. Suspendisse potenti.

In accumsan ante non metus pellentesque, eu blandit turpis pharetra. Aliquam vitae finibus nisl. Suspendisse velit massa, consequat sit amet posuere a, mollis sed magna. Suspendisse mattis turpis sit amet ultricies fermentum. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. In hendrerit ultrices condimentum. Sed quis porta arcu, at tempus metus. Vestibulum ut venenatis sapien, quis accumsan nisi. Mauris volutpat pellentesque metus. Integer bibendum risus ac facilisis volutpat. Fusce justo lectus, tempor sit amet viverra ac, aliquet eget est. Nulla vitae dui at mi vehicula mollis. Integer nec ex vestibulum, rutrum mi at, rhoncus dui. Etiam eleifend, quam eu ultrices mattis, magna libero condimentum sem, quis finibus eros elit eget leo. Sed posuere libero eu sapien faucibus tempor.

Suspendisse ac dolor nec nisl interdum porttitor eu vel sem. Curabitur gravida ex quis ante iaculis vehicula at nec leo. Sed et mi cursus leo facilisis finibus. Nam pellentesque ex at tortor placerat pharetra. Donec ultricies ligula in feugiat consectetur. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Nulla maximus felis diam, nec egestas nisi suscipit suscipit. Nullam tempor varius lacus pharetra lobortis. Nam ut lacinia justo, vitae efficitur nisl.

Morbi volutpat, est at mattis aliquam, ante mauris volutpat quam, non viverra nibh elit quis mi. Vestibulum vulputate tincidunt erat. Vestibulum bibendum venenatis ultricies. Donec ultrices, neque vitae elementum luctus, purus ipsum dictum diam, eget pulvinar dolor est sit amet lorem. Sed efficitur accumsan erat, vitae ultricies nisi sollicitudin vitae. Sed semper lorem non blandit feugiat. Aliquam aliquet neque vitae erat finibus lacinia. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum et lorem magna. Vestibulum vel odio ut tellus consequat ornare at in magna. Aliquam cursus quis risus vel pellentesque. Maecenas ac molestie neque, ac venenatis nulla. Etiam a bibendum arcu. Aenean faucibus quam eu nisl metus.` }),

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
            if(data.text && data.text.toLocaleLowerCase().includes('hello')){
                slackBot.methods.chat.postMessage({ channel: data.channel, text: `Hey there <@${data.user}>!` })
            }
        });
    }
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
    }
}

doTest();