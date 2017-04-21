#!/usr/bin/env node  

// system module
var HTTP        = require('http')
var FS          = require("fs")
var URL         = require('url')
var PATH        = require('path')
var yargs       = require('yargs').argv;

// require module
var mime        = require('mime');

// variable 
var curKey      = '__cur_middleware_index__';
var workUrl     = process.cwd();
var moduleUrl   = __dirname.replace(/(\\|\/)bin(\\|\/)?/g,"");
var staticMime  = /^(application\/javascript|application\/json|text\/html)$/;
var cacheModule = {};
var conModule   = { directory : true};

// Magic midware 
function Magic(argv) {
    var isStart = false,
        cmd = argv[0] || "",
        config = argv[1];
    this.middlewares = [];
    this.parma = argv;
    this.port = 3000

    if (yargs.p && (/\d+/).test(yargs.p)) {
        this.port = yargs.p;
        isStart = true;
    }
    if (yargs.v || yargs.version) {
        console.log("static sever 1.0 version")
    }
    if (yargs.autoindex && yargs.autoindex=="off") {
        conModule.directory = false;
        isStart = true;
    }
    if (yargs.h) {
        console.log('Useage:static <command>');
        console.log('  static -v         show version');
        console.log('  static -p <port>  set listener port ');
        console.log('  static -c <port>  set config');
    }
    if (!yargs.p || isStart) {
        this.listen(this.port)
        console.log("LISTEN :",this.port)
    }
}

Magic.prototype.use = function(middleware) {
    this.middlewares.push(middleware)
}
Magic.prototype.listen =function  (port) {
    var httpServer = HTTP.createServer().listen(port);
        httpServer.on('request', this.listener.bind(this))
}
Magic.prototype.listener = function(req, res) {
    if (!req[curKey]) {
        req[curKey] = 0
    }
    var self = this
    if (this.middlewares[req[curKey]]) {
        this.middlewares[req[curKey]](req, res, function(err) {
            if (err) {
                return console.log("ERROR",err)
            }
            req[curKey]++
            if (req[curKey] < self.middlewares.length) {
                self.listener(req, res)
            }
        })
    }
}
function templateHtml (title,data,res) {
    var dataUrl = {status:title};
    var s = data.toString().replace(/\n/g,"\\n")
    var html = tplHandl(s,dataUrl);
    res.end(html)
}
function init (req, res, next) {
    req.urlJson = URL.parse(req.url);
    next()
}
function log(req, res, next) {
    var url = req.url;
        req.log = ""
    if (!url.match(/favicon\.ico/)) {
        req.log +=req.url+"    "
    }
    next()
}
function walk(path){  
    var dirList = FS.readdirSync(path);
    var arrPath = []
    dirList.forEach(function(item){
        var floder = ""
        if (FS.statSync(path + '/' + item).isDirectory()) {
            floder = "floder"
        }
        if (item.indexOf("\.") != 0) {//隐藏文件不展示
            var s = PATH.normalize((path +"/"+ item).replace(workUrl,""));
            arrPath.push({url:s,file:item,floder:floder})
        }
    });
    return arrPath;
}

function midHeader(req, res, next) {
    var mimeType = res.contentType ||mime.lookup(req.urlJson.pathname);
    var status = res.status || 200;
    if (mimeType == "application/octet-stream" || mimeType == "message/rfc822") {//未知文件类型
        res.writeHead(status, {
            'Content-Type': "text/html"
        })
    }else{
        if(staticMime.test(mimeType)){
            if (req.headers["if-modified-since"]) {
                var curTime = new Date(cacheModule[req.urlJson.pathname]);
                var clientTime = new Date(req.headers["if-modified-since"]);
                if(((+curTime)-(+clientTime)<=0)){
                    status = 304
                }
            }
        }
        res.writeHead(status, {
            "Last-Modified":cacheModule[req.urlJson.pathname].toString().replace(/[^\x00-\xff]+/,"CST"),
            'Content-Type': mimeType
        })
    }
    req.log += status + "  ";
    return status;
}

function favicon(req, res, next) {
    if (req.url === '/favicon.ico') {
        console.log(res.status,"ico")
    } else {
        next()
    }
}

function status(dir) {
    return function(req, res, next) {
        var invalid = false,
            requesturl = "",
            statusCur;
        if ('GET' != req.method && 'HEAD' != req.method) {
            return next();
        }
        console.log("mine",mime.lookup(req.urlJson.pathname))
        if (mime.lookup(req.urlJson.pathname)) {
            try{//非法字符窜将 返回status.html
                requesturl = decodeURIComponent(dir + (req.urlJson.pathname == "/"?"":req.urlJson.pathname));
            }catch(e){
                invalid = true;
            }
            //promise 版本
            var promise = new Promise(function(resolve, reject){
                FS.exists(requesturl,function (exists) {
                    resolve(exists)
                })
            })
            promise
            .then(function(exists) {
                var promise = new Promise(function (resolve, reject) {
                    if (exists) {
                        FS.stat(requesturl,function(err,stats){
                            if (err) {
                                return next(err)
                            }
                            resolve(stats)
                        })
                    }else{
                        statusCur = 404
                        res.status = statusCur;
                        res.writeHead(statusCur);
                        next()
                    }
                })
                return promise
            })
            .then(function(stats) {
                if (stats.isFile() || conModule.directory && !invalid) {
                    statusCur = 200
                }else if(stats.isDirectory() && !conModule.directory ){
                    statusCur = 403
                }
                res.status = statusCur;
                res.writeHead(statusCur);
                next()
            })
            // 异步执行
            // FS.exists(requesturl,function (exists) {
            //     if (exists) {
            //         FS.stat(requesturl,function(err,stats){
            //             if (err) {
            //                 return next(err)
            //             }
            //             if (stats.isFile() || conModule.directory && !invalid) {
            //                 statusCur = 200
            //             }else if(stats.isDirectory() && !conModule.directory ){
            //                 statusCur = 403
            //             }
            //             res.status = statusCur;
            //             res.writeHead(statusCur);
            //             next()
            //         })
            //     }else{
            //         statusCur = 404
            //         res.status = statusCur;
            //         res.writeHead(statusCur);
            //         next()
            //     }
            // })

            //同步版本
            // if (FS.existsSync(requesturl) && (FS.statSync(requesturl).isFile() || conModule.directory )&& !invalid) {
            //     statusCur = 200
            // }else if(!conModule.directory && FS.existsSync(requesturl) && FS.statSync(requesturl).isDirectory() ){
            //     statusCur = 403
            // }
            // else{
            //     statusCur = 404
            // }
            // res.status = statusCur;
            // res.writeHead(statusCur);
            // next()
        } 
    }
}
function static (req, res, next) {
    var url = decodeURIComponent(workUrl + (req.urlJson.pathname == "/"?"":req.urlJson.pathname)),
        templateFile;
    switch(res.status){
        case 200:
        break;
        case 404:
            templateFile = moduleUrl + "/status.html";
            req.contentType = "text/html"
        break;
        case 403:
            templateFile = moduleUrl + "/status.html";
            req.contentType = "text/html"
        break;
    }
    var fileInfo = FS.existsSync(url) && FS.statSync(url) || false;
        if (fileInfo) {// cache static file
            cacheModule[req.urlJson.pathname] = fileInfo.mtime;
        }
        if ( FS.existsSync(url) ) {
            if (fileInfo.isFile()) {//文件路径
                    FS.readFile(url, function(err, data) {
                        if (err) {
                            return next(err)
                        }
                        var status = midHeader(req, res);
                        console.log(req.log)
                        return res.end(data)
                    })
              }else{//文件夹路径
                if ((workUrl) === url && FS.existsSync(url+"/"+app.defaultIndex)) {//主页 默认index.html
                        FS.readFile(url+"/"+app.defaultIndex, function(err, data) {
                            if (err) {
                                return next(err)
                            }
                            return res.end(data)
                        }) 
                }else{// 目录文件夹展示
                    FS.readFile(moduleUrl+"/temp.html", function(err, data) {
                        if (err) {
                            return next(err)
                        }
                        console.log(req.log)
                        if (!conModule.directory) {
                             FS.readFile(templateFile,function(e,d){
                                templateHtml("403 Forbidden",d,res)
                             })
                            return;
                        }
                        var backUrl = req.urlJson.pathname.replace(/(\/[^\/]*)$/,'');
                        var dataUrl = {files:walk(url),back:(backUrl == "" ? "/" : backUrl ),catalogue:decodeURIComponent(req.urlJson.pathname)};
                        var s = data.toString().replace(/\n/g,"\\n")
                        var html = tplHandl(s,dataUrl);
                        return res.end(html)
                    })  
                }
              } 
        }else{
            FS.readFile(templateFile, function(e, d) {
                templateHtml("404 Not Found",d,res)
            })
        }
}
//simple
function tplHandl(tpl, data) {
    var reg = /\{\{(#)?(.*?)?\}\}/g,
        regStart = /^(each)(.*)?/,
        regEnd = /^\/(each)(.*)?/,
        code = 'var r=[];\n',
        cursor = 0,
        eachCmd = false,
        eachObj = {};
    var add = function(line, js) {
      if(js){
        var cmdStart = line.match(regStart);
        var cmdEnd = line.match(regEnd);
        if (cmdStart) {
          var exp = "for (var i = 0; i < "+cmdStart[2]+".length; i++) {"
          eachCmd = true;
          eachObj = cmdStart[2];
          code += exp + '\n';
        }
        else if(cmdEnd){
          code += "}" + '\n';
          eachCmd = false,
          eachObj = {};
        }else{
          if (eachCmd) {
            line = eachObj+"[i]"+"[\""+line+"\"]"
          }
          code += 'r.push(' + line + ');\n'
        }
      }else{
        code += line != '' ? 'r.push("' + line.replace(/"/g, '\\"') + '");\n' : ''
      }
      return add;
    }
    while(match = reg.exec(tpl)) {
        add(tpl.slice(cursor, match.index))(match[2], true);
        cursor = match.index + match[0].length;
    }
    add(tpl.substr(cursor));
    code += 'return r.join("");';
    return new Function('data',"with(data){"+code+"}").apply(data,[data]);
}
var app = new Magic(process.argv.slice(2))
app.defaultIndex = "index.html";
app.use(init)
app.use(log)
app.use(status(workUrl))
app.use(static)
app.use(favicon)

