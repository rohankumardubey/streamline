/**
  * Copyright 2017 Hortonworks.
  *
  * Licensed under the Apache License, Version 2.0 (the "License");
  * you may not use this file except in compliance with the License.
  * You may obtain a copy of the License at
  *   http://www.apache.org/licenses/LICENSE-2.0
  * Unless required by applicable law or agreed to in writing, software
  * distributed under the License is distributed on an "AS IS" BASIS,
  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  * See the License for the specific language governing permissions and
  * limitations under the License.
**/

import _ from 'lodash';
import moment from 'moment';

/*
  getSchemaFields is generic Method for Processors
  Param@ fields = objectArray 'fieldsArr'
  params@ level = number 'level of nesting fields'
  params@ initialFetch = boolean 'this flag is used for joinProcessorNode'
  params@ keyPath = path array ' This value is pass by its own in recursive Method'

  return
  if initialFetch is true it will return two object
  tempFieldsArr = nested fields
  fieldTempArr = is a uniq array of tempFieldsArr filter by name
  else
  it will return only tempFieldsArr = nested fields
*/
const getSchemaFields = function(fields, level, initialFetch, keyPath = [], disabled = true) {
  let fieldTempArr = [] , tempFieldsArr = [];
  const getSchemaNestedFields = (fields, level, keyPath) => {
    fields.map((field) => {
      let obj = {
        name: field.name,
        optional: field.optional,
        type: field.type,
        level: level,
        keyPath: ''
      };

      if (field.type === 'NESTED') {
        if(level == 0 || disabled){
          obj.disabled = true;
        }
        let _keypath = keyPath.slice();
        _keypath.push(field.name);
        // level === 1 ? obj.keyPath = _keypath[0] : '';
        obj.keyPath = keyPath.join('.');
        tempFieldsArr.push(obj);
        getSchemaNestedFields(field.fields, level + 1, _keypath);
      } else {
        obj.disabled = false;
        obj.keyPath = keyPath.join('.');
        tempFieldsArr.push(obj);
      }
    });
    // To make a unique field array
    // initialFetch is use to populate fields only for once
    initialFetch
      ? fieldTempArr = _.uniqBy(tempFieldsArr, 'name')
      : '';
    return initialFetch ? {tempFieldsArr,fieldTempArr} : tempFieldsArr;
  };
  return getSchemaNestedFields(fields, level, keyPath);
};

/*
  createSelectedKeysHierarchy is generic Method for Processors
  params@ arrKeys = objectArray 'arr selected by select2'
  params@ fieldList = objectArray ' it a fieldList array to filter the nesting by name'

  return
  objectArray with nested value for the particular fields by using fieldList array
*/
const createSelectedKeysHierarchy = function(arrKeys,fieldList){
  let tempArr = [];
  const grouped = _.groupBy(arrKeys, (d) => {
    return d.keyPath;
  });

  _.each(grouped, (d, key) => {
    if (key.length > 0) {
      let fieldNames = key.split('.');
      let _arr = tempArr;
      fieldNames.forEach((name, i) => {

        function find(_tempArr) {
          let fieldD;
          _.each(_tempArr, (_d) => {
            const tempkey = _d.keyPath ? _d.keyPath.split('.') : [];
            tempkey.push(_d.name);
            let flag = true;
            _.each(tempkey, (k, ind) => {
              if(k != key.split('.')[ind]){
                flag = false;
              }
            });

            if (_d.name == name && flag) {
              fieldD = _d;
            } else if (_d.fields && _d.fields.length && flag) {
              fieldD = find(_d.fields);
            }
          });
          return fieldD;
        }
        let fieldData = find(tempArr);
        let _fieldData;
        if (fieldData) {
          _fieldData = fieldData;
        } else {
          fieldData = _.find(fieldList, (fld) => {
            // {name: name, keyPath: key}
            const tempkey = fld.keyPath ? fld.keyPath.split('.') : [];
            tempkey.push(fld.name);
            let flag = true;
            _.each(tempkey, (k, ind) => {
              if(k != key.split('.')[ind]){
                flag = false;
              }
            });
            if(fld.name == name && flag) {return fld; }
          });
          _fieldData = JSON.parse(JSON.stringify(fieldData));
        }

        _fieldData.fields = _fieldData.fields || [];
        if (_arr.indexOf(_fieldData) == -1) {
          _arr.push(_fieldData);
        }
        _arr = _fieldData.fields;
        if (i == fieldNames.length - 1) {
          var cloned = JSON.parse(JSON.stringify(d));
          _arr.push.apply(_arr, cloned);
        }
      });
    } else {
      var cloned = JSON.parse(JSON.stringify(d));
      tempArr.push.apply(tempArr, cloned);
    }
  });
  return tempArr;
};

/*
  populateFieldsArr is generic Method for Processors
  params@ arr = objectArray 'it like udflist'
  params@ string = string 'FUNCTION OR AGGREGATE'

  return
  It objectArray filtering the arr by string
*/
const populateFieldsArr = function(arr,string){
  const fieldList = [];
  arr.map((funcObj) => {
    if (funcObj.type === string) {
      fieldList.push(funcObj);
    }
  });
  return fieldList;
};

/*
  getKeysAndGroupKey is generic Method for Processors
  params@ arr = objectArray 'selected value from select2'

  return
  two object keys and gKeys
  keys of array with individual string for select2 'driverId'
  gkeys of array with individual nested string with grouping 'address[streetaddress]'
*/
const getKeysAndGroupKey = function(arr){
  let keys = [];
  let gKeys = [];
  if (arr && arr.length > 0) {
    for (let k of arr) {
      if (k.level !== 0) {
        let t = '';
        let parents = k.keyPath.split('.');
        let s = parents.splice(0, 1);
        parents.push(k.name);
        t = s + "['" + parents.toString().replace(/,/g, "']['") + "']";
        gKeys.push(t);
      } else {
        gKeys.push(k.name);
      }
      keys.push(k.name);
    }
  }
  return {keys,gKeys};
};


/*
  getKeyList is generic Method for Processors
  params@ argName = string 'argument name'
  params@ keyListArr = objectArray 'udfList or functionListArr'

  return
  objectArray filter by argName
*/
const getKeyList = function(argName,keyListArr){
  let fieldObj = keyListArr.find((field) => {
    return field.name === argName;
  });
  return fieldObj;
};

/*
  normalizationProjectionKeys is generic Method for Processors
  this function is used when we perfetch the value from server
  params@ projectionsArr = objectArray 'projections from Processors'
  params@ fieldList = objectArray 'udfList or functionListArr'

  return
  two objectArray
  keyArrObj it remove the expr key with nested obj
  argsFieldsArrObj it clear the '[]' and
  return obj.args is array so we need to tweek it on windows but for projection is works fine.
*/
const normalizationProjectionKeys = function(projectionsArr,fieldList){
  let keyArrObj = [],argsFieldsArrObj = [];
  projectionsArr.map(o => {
    if (o.expr) {
      if (o.expr.search('\\[') !== -1) {
        let n = o.expr.replace(/([.'\[\]\/\\])/g, " ").split(" ");
        let a = _.compact(n);
        o.expr = a[a.length - 1];
      }
      const obj = this.getKeyList(o.expr,fieldList);
      if(obj){
        keyArrObj.push(obj);
      }
    } else {
      let argsArr = [];
      if(_.isArray(o.args)){
        _.map(o.args,(arg) => {
          if (arg.search('\\[') !== -1) {
            let n = arg.replace(/([.'\[\]\/\\])/g, " ").split(" ");
            let a = _.compact(n);
            arg = a[a.length - 1];
          }
          argsArr.push(arg);
        });
      }
      o.args = argsArr;
      argsFieldsArrObj.push(o);
    }
  });
  return {keyArrObj,argsFieldsArrObj};
};

/*
  modifyGroupKeyByDots accept the groupArr return by getKeysAndGroupKey 'gKeys'
  This is used for only JoinProcessor
  And return like "streamId:address.city.ui"

  modifyGroupKeyByDots accept the groupArr with pattern "streams['address']['city']"
  And replce it with dots example "streams.address.city"
  return the array
*/
const modifyGroupKeyByDots = function(groupArr,string){
  let dottedKeys = [];
  _.map(groupArr, (k) => {
    let t = k.replace(/\']\['/g, '.').replace("['"," ").replace("']"," ").split(" ");
    const streamId = t[0];
    t.length > 1 ? t.splice(0,1) : '';
    dottedKeys.push(string ?  t.length > 1 ? streamId+'.'+_.compact(t) : _.compact(t)[0] : streamId+':'+_.compact(t));
  });
  return dottedKeys;
};

const modifyGroupArrKeys = function(tempGroupData,tempStreamArr){
  let tempGroupArr = [],tempGroup = _.cloneDeep(tempGroupData);
  _.map(tempGroup, (groupKey,i) => {
    const pStreamName = groupKey.substr(0 ,groupKey.indexOf(':'));
    const cStreamArr = groupKey.substr(groupKey.indexOf(':') + 1,groupKey.length).split('.');
    const nestedFieldCheck = function(streamList,streamName){
      _.map(streamList, (list) => {
        if(list.fields){
          nestedFieldCheck(list.fields,streamName);
        } else {
          if(list.name === streamName){
            tempGroupArr.push(streamName+'_'+i);
          }
        }
      });
    };
    if(tempGroupArr.length){
      if(tempGroupArr.length === 1 ){
        const {dataVal,_index} = _splitString(tempGroupArr[0]);
        tempGroup[_index] = dataVal;
      }
      tempGroupArr = [];
    }
    nestedFieldCheck(tempStreamArr,cStreamArr[cStreamArr.length-1]);
  });
  if(tempGroupArr.length === 1 ){
    const {dataVal,_index} = _splitString(tempGroupArr[0]);
    tempGroup[_index] = dataVal;
  }
  return tempGroup;
};

const _splitString = function(string){
  const _index = string.substr(string.lastIndexOf('_')+1,string.length);
  const dataVal = string.substr(0,string.lastIndexOf('_'));
  return {dataVal,_index};
};

const findNestedObj = function(streamList,streamName){
  let obj={};
  const nestedObj = function(streamArr,str){
    _.find(streamArr, (stream) => {
      if(stream.fields){
        nestedObj(stream.fields,str);
      } else {
        stream.name === str ? obj = stream : '';
      }
    });
  };
  nestedObj(streamList,streamName);
  return obj;
};

const createOutputFieldsObjArr=  function(outputFieldsArr,outputFieldsList){
  return _.map(outputFieldsArr, (k) => {
    let keyPath = '', keyname = '';
    if(k.includes('.')){
      let kp = k.replace(':','.').split('.');
      keyPath = kp.slice(0,kp.length-1).join('.');
      keyname = kp[kp.length-1];
    } else {
      if(k.split(':').length > 1){
        keyPath = k.split(':')[0];
        keyname = k.split(':')[1];
      }
    }
    return k.split(':').length > 1 ? _.find(outputFieldsList, {keyPath : keyPath , name : keyname}) : _.find(outputFieldsList, {name : k});
  });
};


/*
  selectAllOutputFields accept the array of outputFieldsList
  and return array of unique fields
*/
const selectAllOutputFields = function(tempFields,string){
  let tempAllFields = [];
  _.map(tempFields, (field, i ) => {
    if(field.type !== 'NESTED'){
      let data = null;
      string === 'joinForm'
        ? data = -1
        : data = _.findIndex(tempAllFields, (temp) => {return (temp.name ||  temp.value) === (field.name || field.value);});
      if(data === -1){
        tempAllFields = _.concat(tempAllFields ,field);
      }
    }
  });
  if(string === 'sinkForm'){
    tempAllFields = _.filter(tempFields, (t) => {
      return (!_.has(t, 'streamId') && t.type !== "NESTED");
    });
    tempAllFields = tempAllFields.map((field)=>{return field.value;});
  }
  return tempAllFields;
};

/*
  splitNestedKey accept string and split with dot ('.')
  and return last value of an array
*/
const splitNestedKey = function(key) {
  if(key.search(' as ') !== -1){
    key = key.split(' as ')[0];
  }
  const a = key.replace(':','.').split('.');
  if (a.length > 1) {
    return a[a.length - 1];
  } else {
    return a[0];
  }
};


/*
  generateOutputStreamsArr accept outputStreamFields
  and Transform it to new streamObjArr by
  attaching the streamId to each and every field name

  return streamObjArr {name : "UI", type : "String", optional : false}
*/
const generateOutputStreamsArr = function(fieldList,_level,alias){
  const generateOutputStreams = function(fields,level,alias){
    return fields.map((field) => {
      let obj = {
        name: !!alias ? field.alias : field.name ,
        type: field.type ,
        optional : field.optional || false
      };

      if (field.type === 'NESTED' && field.fields) {
        obj.fields = generateOutputStreams(field.fields, level + 1,alias);
      }
      return obj;
    });
  };
  return generateOutputStreams(fieldList,_level,alias);
};

const getNestedKeyFromGroup = function(str){
  if(!str){
    return;
  }
  if(str.includes('[')){
    const t = str.replace(/([.'\[\]\/\\])/g," ").split(' ');
    const m = _.compact(t);
    str = m[m.length - 1];
  }
  return str;
};

export class Streams {
  constructor(streams,type){
    this.streams = streams;
    this.nodeType = type || '';
  }
  setParent(streams){
    const setParentOfChild = (stream, parent) => {
      stream._parent = parent;
      if(stream.fields && stream.fields.length){
        stream.fields.forEach((s) => {
          setParentOfChild(s, stream);
        });
      }
    };
    streams.forEach((s) => {
      setParentOfChild(s);
    });
  }
  cloneStreams(streams){
    return JSON.parse(JSON.stringify(streams || this.streams));
  }
  filterByType(type){
    const streams = this.cloneStreams(this.streams);
    this.setParent(streams);

    const remove = (stream, arr) => {
      const i = arr.indexOf(stream);
      arr.splice(i,1);
      return true;
    };

    const filter = (stream, arr) => {
      if(stream.fields && stream.fields.length){
        for(let i = 0; i< stream.fields.length;){
          const removed = filter(stream.fields[i], stream.fields);
          if(!removed){
            i++;
          }
        }
        if(!stream.fields.length){
          return remove(stream, arr);
        }
      } else if(stream.type != type) {
        return remove(stream, arr);
      }
    };

    for(let i = 0; i< streams.length;){
      const removed = filter(streams[i], streams);
      if(removed !== true){
        i++;
      }
    }
    return streams;
  }
  toSelectOption(streams){
    const options = [];
    const pushOptions = (fields, level, keyArr = [], streamId = '') => {
      fields.forEach((f) => {
        if(!f.name){
          f.name = f.streamId;
        }
        f.level = level;
        f.value = f.name;

        let _streamId = streamId;
        if(_streamId === ''){
          _streamId = f.streamId;
          f.uniqueID = _streamId;
        } else {
          const tempKeyArr = _.clone(keyArr);
          tempKeyArr.push(f.name);
          f.uniqueID = this.nodeType !== '' ? tempKeyArr.join('.') : _streamId + ':' + tempKeyArr.join('.');
        }

        options.push(f);
        if(f.fields && f.fields.length){
          f.disabled = true;
          const newKeyArr = _.clone(keyArr);
          if(_streamId !== f.name){
            newKeyArr.push(f.name);
          }
          pushOptions(f.fields, level+1, newKeyArr, _streamId);
        }
      });
    };
    pushOptions(streams || this.cloneStreams(), 0);

    return options;
  }
  toNoNestedSelectOption(streams){
    const _streams = streams || this.cloneStreams();
    _streams.forEach((stream) => {
      /*stream.fields.forEach((childField) => {
        if(childField.fields){
          delete childField.fields;
        }
      });*/
      for(let i = 0; i< stream.fields.length;){
        const childField = stream.fields[i];
        if(childField.fields){
          stream.fields.splice(i,1);
        }else{
          i++;
        }
      }
    });
    return this.toSelectOption(_streams);
  }
}

const removeChildren = function (arr){ //Remove children from top level if parent is selected
  for(let i = 0; i < arr.length;){
    let removed = false;
    const field = arr[i];
    const hasParent = arr.find((f) => {
      return (f.keyPath+'.'+f.name) == field.keyPath;
    });
    if(hasParent){
      arr.splice(i,1);
      removed = true;
    }
    if(!removed){
      i++;
    }
  }
};

const addChildren = function(arr, outputFieldsList){ //Add children of selected parent
  for(let i = 0; i < arr.length;i++){
    const field = arr[i];
    if(field.type == 'NESTED'){
      const subFields = field.fields = [];
      outputFieldsList.forEach((ofld) => {
        if(ofld.keyPath == (field.keyPath+'.'+field.name)){
          subFields.push(ofld);
        }
      });
      addChildren(subFields,outputFieldsList);
    }
  }
};

const filterOptions = function(selected, outputFieldsList){ //Filter out children from select options if parent is selected
  const options = [];
  outputFieldsList.forEach((f) => {
    const isParentSelected = selected.find((sf) => {
      return (sf.keyPath+'.'+sf.name) == f.keyPath;
    });
    if(!isParentSelected){
      options.push(f);
    }
  });
  return options;
};

const generateCodeMirrorOptions = (array,type,modeType) => {
  let arr=[];
  const nestedFields = (arrayList,type,level,oldObj) => {
    _.map(arrayList, (a) => {
      let obj = {
        text : a.displayName || a.name || a,
        displayText : a.displayName || a.name || a,
        filterText : !!oldObj ? oldObj.filterText+'.'+(a.displayName || a.name || a)  :  a.displayName || a.name || a,
        className : type === "FUNCTION"
                    ? "codemirror-func"
                    : type === "SQL"
                      ? "codemirror-sql"
                      :  type === "BINARY-OPERATORS"
                          ? "codemirror-Operators"
                          : "codemirror-field"
      };
      obj[type === "FUNCTION" ?  "returnType" : "type"] = type === "FUNCTION"
                                                          ?  a.returnType
                                                          : type === "SQL"
                                                            ? 'SQL'
                                                            : type === "BINARY-OPERATORS"
                                                              ? "Binary Operators"
                                                              : a.type;
      if(type === "FUNCTION"){
        obj.argsType = a.argTypes.toString();
        obj.description =  a.description ? `Description: ${a.description}` : undefined;
      }
      obj.render = (el, cm, data) => {
        codeMirrorOptionsTemplate(el,data);
      };

      if(oldObj === undefined){
        arr.push(obj);
      } else {
        const index = _.findIndex(arr, (n) => n.filterText === oldObj.filterText);
        if(index !== -1){
          const name = obj.displayText;
          if(modeType === 'sql'){
            obj.displayText = oldObj.displayText+'.'+name;
            obj.text = oldObj.text+'.'+name;
          }else{
            obj.displayText = name;
            obj.text = name;
          }
          obj.filterText = oldObj.text+'.'+name;
          if(arr[index].fields){
            arr[index].fields.push(obj);
          } else {
            arr[index].fields = [];
            arr[index].fields.push(obj);
          }
        } else {
          const indexPath = getNestedObjPathFromList(arr,oldObj);
          if(indexPath.length){
            pushNestedObjectInArray(indexPath,obj,arr,modeType);
          }
        }
      }
      if(a.fields){
        nestedFields(a.fields, type,level+1,obj);
      }
    });
    return arr;
  };
  return nestedFields(array,type,0);
};

const pushNestedObjectInArray = (pathArr,obj,targetList,modeType) => {
  const rollOverFields = (target) => {
    _.map(target, (list) => {
      if(pathArr === list.filterText){
        if(modeType === 'sql'){
          obj.displayText = pathArr+'.'+obj.displayText;
          obj.text = pathArr+'.'+obj.text;
        } else {
          obj.displayText = obj.displayText;
          obj.text = obj.text;
        }
        obj.filterText = pathArr+'.'+obj.text;
        if(list.fields){
          list.fields.push(obj);
        } else {
          list.fields = [];
          list.fields.push(obj);
        }
      } else {
        if(list.fields){
          rollOverFields(list.fields);
        }
      }
    });
  };
  rollOverFields(targetList);
};

const getNestedObjPathFromList = (list,obj) => {
  let str = [];
  const recursiveFunc = (arr,level) => {
    _.map(arr,(a) => {
      if(a.fields){
        str.push(a.filterText);
        recursiveFunc(a.fields,level+1);
      } else {
        if(obj.filterText === a.filterText){
          str.push(a.filterText);
        }
      }
    });
    return _.findLast(str);
  };
  return recursiveFunc(list,0);
};

const codeMirrorOptionsTemplate = (el,data) => {
  const text = document.createElement('div');
  const fNameSpan = document.createElement('span');
  fNameSpan.setAttribute('class','funcText');
  fNameSpan.innerHTML = data.displayText;

  // data.argsType is only for UDF Function
  if(data.argsType && data.argsType.length){
    const paramSpan = document.createElement('span');
    paramSpan.innerHTML = '('+data.argsType+')';
    fNameSpan.appendChild(paramSpan);
  }
  text.appendChild(fNameSpan);
  el.appendChild(text);

  // data.returnType is for UDF Function ||  data.type is for Fields
  if(data.returnType || data.type){
    const returnTypetxt = document.createElement('div');
    returnTypetxt.setAttribute('class','fieldText');
    const content = data.returnType ? 'Return Type: '+data.returnType : 'Type: '+data.type;
    returnTypetxt.innerHTML = content;
    el.appendChild(returnTypetxt);
  }
};

const webWorkerValidator = function(fieldsHintArr, functionListArr) {
  return `
    self.onmessage = function(msg) {
      const funcs = ${JSON.stringify(functionListArr)};
      const arg = ${JSON.stringify(fieldsHintArr)};

      let obj={};
      let defaults = {
        BOOLEAN: new Boolean().valueOf(),
        BYTE: new Number().valueOf(),
        SHORT: new Number().valueOf(),
        INTEGER: new Number().valueOf(),
        LONG: new Number().valueOf(),
        FLOAT: new Number().valueOf(),
        DOUBLE: new Number().valueOf(),
        STRING: new String().valueOf(),
        BINARY: new Blob().valueOf(),
        NESTED: new Object().valueOf(),
        ARRAY: new Array().valueOf(),
        BLOB: new Blob().valueOf()
      };

      for(let i = 0; i < funcs.length;i++){
        const fd = funcs[i];
        eval('var '+fd.displayName+' = function(){ checkForArgs(arguments, fd.displayName); return defaults[fd.returnType]}');
      }
      /*for(let i = 0; i < arg.length;i++){
        const argd = arg[i];
        eval('var '+argd.name+' = [argd.name]]');
      }*/

      function nestedArguments(arg,level,path = []){
        for(let i = 0; i < arg.length;i++){
          if(arg[i].fields){;
            let _path = path.slice();
            _path.push(arg[i].name);
            try{
              const field = eval(_path.join('.'));
              if(field == undefined){
                eval(_path.join('.') + ' = {}');
              }
            }catch(e){
              eval(' ' + arg[i].name + ' = {}');
            }
            nestedArguments(arg[i].fields,level+1,_path);
          }else{
            let argd = path.length ? path.join('.')+'.'+arg[i].name : arg[i].name ;
            eval(' '+argd+' = defaults[arg[i].type]');
          }
        }
      };
      nestedArguments(arg,0);

      function checkForArgs(arg, fname){
        var argLength = arg.length;
        const func_def = funcs.find((f) => {
          return f.displayName == fname && f.argTypes.length == argLength;
        });
        if(!func_def){
          throw new Error(fname +'() arguments mismatch');
        }
        for(let i = 0; i < argLength; i++){
          const _arg = arg[i];
          const ex_arg = func_def.argTypes[i];
          /*if(ex_arg.indexOf(_arg.type) < 0){
            throw new Error(fname +'() argument type mismatch');
          }*/
          function checkType(types){
            let includes = false;
            types.forEach(type => {
              if(ex_arg.includes(type) && !includes){
                includes = true;
              }
            });
            if(!includes){
              throw new Error(fname +'() argument type mismatch');
            }
          }
          if(_arg == undefined){
            checkType([]);
          }else if(typeof _arg == "string"){
            checkType(['STRING']);
          }else if(typeof _arg == "number"){
            checkType(['BYTE', 'SHORT', 'INTEGER', 'LONG', 'FLOAT', 'DOUBLE']);
          }else if(typeof _arg == "boolean"){
            checkType(['BOOLEAN']);
          }else if(typeof _arg == "object" && _arg instanceof Object){
            checkType(['NESTED']);
          }else if(typeof _arg == "object" && _arg instanceof Array){
            checkType(['ARRAY']);
          }else if(typeof _arg == "object" && _arg instanceof Blob){
            checkType(['BLOB']);
          }
        }
      }

      function validator(data,cb){
        try{
          eval('('+ data +')');
          cb(null, data);
        }catch(err){
          cb(err.message, data);
        }
      }

      const payloadId = msg.data.id;
      validator(msg.data.payload, function(err,result){
        const msg = {
          id: payloadId,
          payload: result
        };
        if(err){
          msg.err = err;
        }
        self.postMessage(msg);
      });
    }
  `;
};

const getReturnTypeFromCodemirror = function(value,functionArr,fieldsArr,processorState) {
  let returnType='DOUBLE',error='',boolType=false;
  const enumValue = {"SHORT": 1,"INTEGER": 2,"FLOAT": 3,"DOUBLE":4,"LONG":5};

  const getReturnTypeFromNumbers = (cValue) => {
    let type = '';
    const c_value = parseFloat(cValue);
    if(cValue.includes('.') && !/[a-zA-Z]/.test(cValue)){
      const dArr = cValue.split('.');
      if(dArr.length > 2){
        error = "invalid number.";
      } else {
        type = dArr[1].length <= 7 ? "FLOAT" : "DOUBLE";
      }
    } else {
      if(/[a-zA-Z]/.test(cValue)){
        error = "invalid number.";
      } else {
        type = cValue <= 2147483647 ? "INTEGER" : "LONG";
      }
    }
    return type;
  };

  // override return type for ["SHORT","INTERGER","FLOAT","DOUBLE",LONG]
  const overRideIntReturnType = (newType,oldType) => {
    let type = oldType;
    if(enumValue[oldType] < enumValue[newType]){
      type = newType;
    }
    return type;
  };

  // Overloading function
  const funcOverLoading = (fObj) => {
    const {functionArr,o} = fObj;
    const tFunc = _.filter(functionArr, (func) => func.displayName === o.displayName);
    if(tFunc.length > 1){
      return _.findLast(tFunc);
    } else {
      return o;
    }
  };

  // Nested Function to check comma... ','
  const expressionContainsComma = (tObj) => {
    const {val,level,oldObj,obj,functionArr} = tObj;
    const trimVal = val.endsWith(')') ? val.replace(/[)]/gi,'') : val;
    let args = trimVal.split(',');
    let o = level > 0 ? oldObj : obj;
    if(/[)]/.test(val)){
      const openB = value.split('(').splice(0,(value.split('(').length-1));
      const closeB = val.split(')').splice(0,(val.split(')').length-1));
      let ObjName='';
      const openL = openB.length, closeL = closeB.length;
      if(openB.length > 1){
        ObjName = openB[closeL > 1 ? ((openL === closeL || openL < closeL) ? 0 : (closeL-1)) : closeL];
      } else {
        ObjName= openB[0];
      }
      o = _.find(functionArr, (func) => func.displayName === ObjName);
      args = _.compact(val.split(')').map(function(a) {return a.replace(/[,]/gi,' ');}));
      if(openL === closeL || openL < closeL){
        args = args.splice(0,o.argTypes.length);
      }
    }
    if(args.length > o.argTypes.length){
      o = funcOverLoading({functionArr,o});
    }
    if(args.length <= o.argTypes.length){
      _.map(args, (a,i) => {
        const fields = findNestedObject(fieldsArr,a);
        if(!_.isEmpty(fields) && _.isNaN(parseInt(a))){
          const argObj = checkReturnTypeSupport(o,fields,'type', processorState);
          if(!!argObj.returnType){
            returnType = argObj.returnType;
          }
          error = argObj.error || (argObj.returnType !== o.argTypes[i]) ? `Function doesn't support the arguments return type.` : null;
        }
      });
    } else {
      error = `Function doesn't support more arguments .`;
    }
  };

  // Expression contains no parent function... (driverId
  const noParentFunctionInExpression = (val) => {
    const tVal = val.split(' ') ;
    const recursiveCall = (value) => {
      value.forEach((v,i) => {
        if(!/[`~!@#$%^&0-9()|\???;:,\{\}\[\]\\]/.test(v)){
          const fields = findNestedObject(fieldsArr,v);
          if(!_.isEmpty(fields) && _.isNaN(parseInt(v)) && !boolType){
            if(!!returnType && i > 0){
              if(_.keys(enumValue).toString().includes(fields.type)){
                returnType = overRideIntReturnType(returnType , fields.type);

              }else if(returnType.toLowerCase() !== fields.type.toLowerCase()){
                error = 'miss match arguments returnType.';
              }
            } else {
              returnType = fields.type;
            }
          } else if(/[<>]/.test(v)){
            boolType = true;
            returnType = "BOOLEAN";
          }
        } else {
          if(/[-+*<>=()]/.test(v)){
            const tValue = _.compact(v.replace(/[-+*=()]/gi,' ').split(' '));
            recursiveCall(tValue);
          } else {
            returnType = getReturnTypeFromNumbers(v);
          }
        }
      });
      return returnType;
    };
    return recursiveCall(tVal);
  };

  const ind =  checkBracketInString(value);
  if(ind !== -1){
    const {f_val, s_val} = stringSpliter(value,ind);
    let tF_val =  f_val.replace(/[-+*=()\/]/gi,' ').split(' ');
    if(tF_val.length > 1){
      const comValue = _.compact(tF_val);
      const popValue = comValue.length > 1 ? comValue.pop(comValue.length-1).toString() : comValue[0];
      returnType = noParentFunctionInExpression(comValue.join(' '));
      tF_val = popValue;
    } else {
      tF_val=tF_val[0];
    }
    const obj = _.find(functionArr, (func) => func.displayName === tF_val);
    if(obj){
      if(!boolType){
        returnType = obj.returnType;
      }
    }
    // expression start with bracket...
    if(f_val === ''){
      if(processorState){
        processorState.populateCodeMirrorDefaultHintOptions();
      }
      returnType = noParentFunctionInExpression(s_val);
    }
    // s_val is the string after the function bracket.. and recursive call
    if(!!s_val && !!f_val){
      const nestedFunction = (val,level,oldObj) => {
        const b_index = checkBracketInString(val);
        if(b_index !== -1){
          const {f_val, s_val} = stringSpliter(val,b_index);
          const innerObj = _.find(functionArr, (func) => func.displayName === f_val);
          if(innerObj){
            const funcResultObj = checkReturnTypeSupport(obj,innerObj,'returnType', processorState);
            if(!!funcResultObj.returnType){
              if(!boolType){
                returnType = funcResultObj.returnType;
              }
            }
            error = funcResultObj.error;
            if(!!s_val){
              nestedFunction(s_val,level+1,innerObj);
            }
          } else {
            error = "The function is invalid.";
          }
        } else {
          const trimVal = val.endsWith(')') ? val.replace(/[)]/gi,'') : val;
          const inner_Args = findNestedObject(fieldsArr,trimVal);
          if(!_.isEmpty(inner_Args)){
            const argResultObj = checkReturnTypeSupport(obj,inner_Args,'type', processorState);
            if(!!argResultObj.returnType && !boolType){
              returnType = argResultObj.returnType;
            }
            error = argResultObj.error;
          } else {
            if(/[,]/.test(val)){
              expressionContainsComma({val,level,oldObj,obj,functionArr});
            } else if(/[']/.test(val)){
            }else {
              if(!checkValueTypeToReturnType(trimVal,returnType).flag){
                error = "The arguments is invalid.";
              }
            }
          }
        }
      };
      if(processorState){
        processorState.populateCodeMirrorHintOptions();
      }
      nestedFunction(s_val,0);
    }

  } else {
    if(processorState){
      processorState.populateCodeMirrorDefaultHintOptions();
    }
    returnType = noParentFunctionInExpression(value);
  }

  return {returnType,error};
};

const checkValueTypeToReturnType = function(val,returnType) {
  let flag= false;
  const returnTyp = !!returnType ? returnType.toLowerCase() : '';
  let tVal = _.isNaN(parseInt(val)) ? val : parseInt(val);
  const type = typeof tVal;
  switch(type){
  case 'string' : flag = type === returnTyp ? true : false;
    break;
  case 'number' : flag = (returnTyp !== 'string') ? true : false;
    break;
  default:break;
  }
  return {flag,type};
};

const findNestedObject = function(fieldsArr,string) {
  let obj={};
  const recursiveFunc = (arr,s) => {
    _.map(arr, (a) => {
      if(a.fields){
        recursiveFunc(a.fields,s);
      } else {
        if(a.name === s){
          obj = a;
        }
      }
    });
    return obj;
  };
  const str = /[.]/.test(string) ? _.last(string.split('.')) : string;
  return recursiveFunc(fieldsArr,str);
};

const checkReturnTypeSupport = function(pObj,innerObj,type, pState) {
  const obj = {};
  const returnFlag = pObj.argTypes.toString().includes(innerObj[type]);
  if(returnFlag){
    obj.returnType = pState
                      ? pObj.returnType
                        ? pObj.returnType
                        : innerObj[type]
                          ? innerObj[type]
                          : 'DOUBLE'
                      : innerObj[type];
  } else {
    if(!_.isEmpty(innerObj)){
      obj.error = "Function doesn't support the arguments return type." ;
    }
  }
  return obj;
};

const checkBracketInString = function(value) {
  return value.indexOf('(');
};

const stringSpliter = function(val,index) {
  let f_val = val.slice(0,index);
  const s_val = val.slice((index+1),val.length);
  if(/[,]/.test(f_val)){
    f_val = _.findLast(f_val.split(','));
  }
  return {f_val,s_val};
};

export default {
  getSchemaFields,
  createSelectedKeysHierarchy,
  populateFieldsArr,
  getKeysAndGroupKey,
  getKeyList,
  normalizationProjectionKeys,
  modifyGroupKeyByDots,
  modifyGroupArrKeys,
  findNestedObj,
  createOutputFieldsObjArr,
  selectAllOutputFields,
  splitNestedKey,
  generateOutputStreamsArr,
  getNestedKeyFromGroup,
  removeChildren,
  addChildren,
  filterOptions,
  generateCodeMirrorOptions,
  codeMirrorOptionsTemplate,
  webWorkerValidator,
  getReturnTypeFromCodemirror
};
