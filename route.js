// system module
var HTTP        = require('http')
var FS          = require("fs")
var URL         = require('url')
var PATH        = require('path')

// custom module
var mime        = require('mime');
var curKey      = '__cur_middleware_index__';
var workUrl     = process.cwd();
var moduleUrl   = __dirname.replace(/\/bin(\/)?/g,"");
var staticMime  = /^(application\/javascript|application\/json|text\/html)$/;
var cacheModule = {}

//simple
var tplHandl = function(tpl, data) {
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
          var exp = "for (var i = 0; i < "+cmdStart[2]+".length; i++) {debugger;"
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


// Magic midware 
function Magic(argv) {
    var isStart = false,
        cmd = argv[0] || "";
    this.middlewares = [];
    this.parma = argv;
    this.port = 3000
    if (cmd == "-p" && argv[1] && argv[1].match(/\d+/)) {
        this.port = argv[1];
        isStart = true;
    }
    if (cmd.match(/^-v$|^--version$/g)) {
        console.log("static sever 1.0 version")
    }
    if (cmd == "-h") {
        console.log('Useage:static <command>');
        console.log('  static -v         show version');
        console.log('  static -p <port>  set listener port ');
    }
    if (argv.length && !cmd || isStart) {
        this.listen(this.port)
        console.log("LISTEN :",this.port)
    }
}

Magic.prototype.use = function(middleware) {
    this.middlewares.push(middleware)
}
Magic.prototype.listen =function  (port) {
    console.log("port",port)
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
    var urlObj = URL.parse(req.url);
    var mimeType = mime.lookup(urlObj.pathname);
    var status = req.status || 200;

    if (mimeType == "application/octet-stream" || mimeType == "message/rfc822") {//未知文件类型
        res.writeHead(status, {
            'Content-Type': "text/html"
        })
    }else{
        if(staticMime.test(mimeType)){
            if (req.headers["if-modified-since"]) {
                var curTime = new Date(cacheModule[urlObj.pathname]);
                var clientTime = new Date(req.headers["if-modified-since"]);
                if(((+curTime)-(+clientTime)<=0)){
                    status = 304
                }
            }
        }
        res.writeHead(status, {
            "Last-Modified":cacheModule[urlObj.pathname],
            'Content-Type': mimeType
        })
    }
    req.log += status + "  ";
    return status;
}

function favicon(req, res, next) {
    if (req.url === '/favicon.ico') {} else {
        next()
    }
}

function static(dir) {
    return function(req, res, next) {
        if ('GET' != req.method && 'HEAD' != req.method) {
            return next();
        }
        var urlObj = URL.parse(req.url);
        if (mime.lookup(urlObj.pathname)) {
            try{//非法字符窜将 返回404.html
                var url = decodeURIComponent(dir + (urlObj.pathname == "/"?"":urlObj.pathname));
            }catch(e){
                var url = moduleUrl + "/404.html"
            }
            if (FS.existsSync(url)) {
                var fileInfo = FS.statSync(url);
                if (fileInfo) {// cache static file
                    cacheModule[urlObj.pathname] = new Date(fileInfo.mtime).toGMTString();
                }
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
                        var backUrl = urlObj.pathname.replace(/(\/[^\/]*)$/,'');
                        var dataUrl = {files:walk(url),back:(backUrl == "" ? "/" : backUrl ),catalogue:decodeURIComponent(urlObj.pathname)};
                        var s = data.toString().replace(/\n/g,"\\n")
                        var html = tplHandl(s,dataUrl);
                        return res.end(html)
                    })  
                }
              }
            }
        } else {
            next()
        }
    }
}
var app = new Magic(process.argv.slice(2))
app.defaultIndex = "index.html"
app.use(log)
app.use(static(workUrl))
app.use(favicon)
module.exports = function  () {
    return app;
}

