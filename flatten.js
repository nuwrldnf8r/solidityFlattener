/*
Copyright 2019 Gavin Marshall

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING 
ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, 
DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, 
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE 
USE OR PERFORMANCE OF THIS SOFTWARE.

*/

const readline = require('readline');
const fs = require('fs');
const _path = require('path');
const eol = require('os').EOL;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let getPath = () => {
    return new Promise((resolve,reject) => {
        if(process.argv.length>2){
            resolve(process.argv[2]);
        }
        else{
            rl.question('Enter path to flatten: ', (path) => {
                resolve(path);
            });
        }
    });
}

let getFile = (path) => {
    return new Promise((resolve,reject) => {
        fs.readFile(path,(err,ret) => {
            if(err){
                reject(err);
            }
            else{
                resolve(ret.toString());
            }
        })
    })
}

let handleError = (err) =>{
    if(err.code == 'ENOENT'){
        return 'No file exists at ' + err.path;
    }
    else{
        console.log(err);
    }
}

let removeExcessSpaces = (s) =>{
    while(s.split('  ').length>1){
        s = s.split('  ').join(' ');
    }
    if(s[0]==' '){
        s = s.substr(1);
    }
    if(s[s.length-1]==' '){
        s = s.substr(0,s.substr.length-1);
    }
    return s;
}

let splitFile = (file) => file.split(eol).map(l=>removeExcessSpaces(l));

let getDependancies = (file) => {
    let ar = [];
    let lines = splitFile(file);
    for(var i in lines){
        if(lines[i].indexOf('import ')>-1){
            let line = lines[i].split(' ')[1].split('\'').join('').split('"').join('');
            line = line.substr(0,line.length-1);
            ar.push(line);
        }
        else if(lines[i].indexOf('contract ')>-1){
            break;
        }
    }
    return ar;
}

let getPragma = (file) =>{
    let lines = splitFile(file);
    let pragma;
    for(var i in lines){
        if(lines[i].indexOf('pragma solidity')>-1){
            pragma = lines[i];
            break;
        }
    }
    return pragma;
}

let getActualPath = (depPath, basePath) => {
    let baseDir = _path.dirname(basePath);
    return _path.join(baseDir,depPath);
}

let trimAr = (ar) => {
    while(ar[ar.length-1]===''){
        ar = ar.slice(0,ar.length-1)
    }
    return ar;
}

let getContracts = (file) => {
    let arContracts = [];
    let lines = file.split(eol);
    let start = -1;
    let end = 0;
    for(var i in lines){
        let line = lines[i];
        let words = removeExcessSpaces(line).split(' ');
        //console.log(words);
        if((words[0]=='contract' || words[0]=='library') && words[words.length-1]==='{'){
            if(start>-1){
                let ar = lines.slice(start,parseInt(i)-1);
                arContracts.unshift(trimAr(ar).join(eol));
            }
            start = parseInt(i);
        }
    }
    let ar = lines.slice(start,lines.length);
    arContracts.unshift(trimAr(ar).join(eol));
    return arContracts;
}

let addLine = (path,s) => {
    return new Promise((resolve,reject) => {
        fs.appendFile(path, s + eol, e => {
            if(e){
                reject(e);
            }
            else{
                resolve(null);
            }
        })
    })
}

let clearOld = (path) => {
    return new Promise((resolve,reject) => {
        fs.writeFile(path, '', (err) => {
            if(err){
                reject(err);
            }
            else{
                resolve(null);
            }
        });
    })
}

let writeFile = async (path, pragma,arContracts) => {

    try {
        var ar = [];
        for(var i in arContracts){
            if(ar.indexOf(arContracts[i])===-1){
                ar.push(arContracts[i]);
            }
        }
        await clearOld(path);

        await addLine(path,pragma);
        await addLine(path,'');
        for(contract of ar){
            let lines = contract.split(eol);
            for(line of lines){
                await addLine(path, line);
            }
            await addLine(path,'');
        }

        return null;
    }
    catch(e){
        throw e;
    }
}


let processFile = async (path, ar) => {
    try{
        let first = (!Array.isArray(ar));
        ar = (first)?[]:ar;
        
        let file = await getFile(path);
        let pragma = getPragma(file);
        let dep = getDependancies(file).map(d=>getActualPath(d,path));
        let contracts = getContracts(file);
        contracts.map(c=>ar.unshift(c));
        for(var i in dep){
            let depContracts = await processFile(dep[i],ar);
            depContracts.map(c=>ar.unshift(c));
        }
        if(!first){
            return ar;
        }
        else{
            let parsedPath = _path.parse(path);
            let newPath = parsedPath.name + '_flattened' + parsedPath.ext;
            await writeFile(newPath, pragma, ar);
            return newPath;
        }
    }
    catch(e){
        throw e;
    }
}

let flatten = async () => {
    try{
        let path = await getPath();
        let newPath = await processFile(path);
        console.log('done - flattened file written to ' + newPath);
    }
    catch(e){
        console.log(handleError(e));
    }
    return;
}

flatten().then(r=>process.exit());
