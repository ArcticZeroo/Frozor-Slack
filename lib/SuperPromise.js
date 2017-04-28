const Promise = require('bluebird');

class SuperPromise{
    constructor(executor, callback){
        // Create a promise which will handle the resolve/reject if no callback is specified
        return new Promise((resolve, reject)=>{

            // If there's a callback, call it. Otherwise, reject/resolve.
            function success(...data) {
                if(callback){
                    callback(null, ...data);
                }else{
                    resolve(...data);
                }
            }

            function fail(err, ...data) {
                if(callback){
                    callback(err, ...data);
                }else{
                    reject(err, ...data);
                }
            }

            // Allow the executor to run with the custom success/fail functions
            executor(success, fail);
        });
    }

    static create(executor, callback){
        return new SuperPromise(executor, callback);
    }
}

module.exports = SuperPromise;