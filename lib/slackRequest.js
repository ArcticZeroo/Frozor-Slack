const config  = require('../config/');
const request = require('request');

function createSlackRequestUrl(method, properties = {}){
    let base_url = config.base_url+method;
    let args     = [];

    for(let property of Object.keys(properties)){
        let value = properties[property];
        if(typeof value != 'string'){
            value = JSON.stringify(value);
        }
        args.push(`${property}=${encodeURIComponent(value)}`);
    }

    return `${base_url}?${args.join('&')}`;
}

function makeSlackRequest(url, args = {}){
    // Callback is (<Boolean>success, <?>result)
    return new Promise((resolve, reject)=>{
        request({url: createSlackRequestUrl(url, args), json: true}, (err, res, body)=>{
            // If there's a request error/response statusCode that isn't 200, callback(false, [err])
            if(err){
                return reject(err);
            }

            if(res.statusCode !== 200){
                return reject((body) ? ((body.error) ? `${res.statusCode}: ${body.error}` : res.statusCode) : res.statusCode + ': Unknown Error (no body)');
            }

            // If body.ok is false then we tell them that all is not ok
            // and give them the error in the body.
            if(!body.ok){
                return reject(body.error);
            }

            // Otherwise it's good to go
            resolve(body);
        });
    });
}

exports.makeRequest = makeSlackRequest;