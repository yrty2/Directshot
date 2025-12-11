const blueocean={
    version:1.0,
    opcode:["print","as","where","in","is","consume_R","for","whr","fn","while","assign"],
    tokenizer(code){
        function pushAt(u,t,v){
        return [...u.slice(0,t+1),v,...u.slice(t+1,u.length)];
        }
        function In(a,u){
            return u.findIndex(e=>JSON.stringify(e)==JSON.stringify(a))!=-1;
        }
        let tokens=[];
        let token=[];
        var tape="";
        function cut(){
            if(tape.length>0){
                token.push(tape);
            }
            tape="";
        }
        function add(value){
            token.push(value);
        }
        var reading=0;
        const opcode=blueocean.opcode;//x as 1+2 in H
        //types i32_u->N i32_s->Z f32->R f32,f32->C v128.f32x4->H
        //const x:[type]=[Number]->define x as [Number] in [type]
        //let x:[type]=[Number]->where x is [Number] in [type]
        //省略記法 whr x=[Number] in [type]
        const operators=["+","-","*","/","^","!","~","%","=","・","°",",","$","'",":",">","<"];
        const splitter=[";","\n"];
        const uoperator=["~","°","$",","];
        //課題：冪演算が乗算と同じ優先度になっている。
        //優先度　階乗>>冪乗>>乗算>>加算>>符号
        let startpoint=true;
        let linestart=2;
        let inabs=false;
        let blockdecl=false;
        for(let k=0; k<code.length; ++k){
            var safe=true;//テープに記述するか
            const word=code[k];
            if(word=="(" || word==")"){
                reading=0;
                startpoint=(word=="(");
                //カッコだった。
                cut();
                add(word);
                safe=false;
            }
            if(word=="{" || word=="}"){
                reading=0;
                startpoint=(word=="{");
                //カッコだった。
                cut();
                add(word);
                safe=false;
            }
            if(In(tape,opcode)){
                if(tape=="for"){
                    blockdecl=true;//必要かな？
                }
                cut();
            }
            if(/^[a-zA-Z]+$/.test(word) && reading==0){
                //変数または関数
                reading=1;
                cut();
            }
            if(word=="|"){
                //絶対値記号だった。
                cut();
                add(word);
                inabs=!inabs;
                safe=false;
            }
            if(In(word,operators)){
                reading=0;
                if(startpoint && (word=="+" || word=="-")){
                    cut();
                    if(word=="-"){
                    add("-1");
                    add("*");
                    }
                    safe=false;
                    startpoint=false;//大丈夫かな？
                }else{
                cut();
                if(k+1<code.length && In(code[k+1],operators)){
                    let op=word;
                    let uop=In(word,uoperator);
                    let fact=word=="!";//uopなら階乗でない限り重ならない。例えば6!!
                    while(!uop && k+1<code.length && In(code[k+1],operators)){
                        if(!fact || code[k+1]=="!"){
                            k++;
                            op+=code[k];
                        }else{
                            break;
                        }
                    }
                    if(op=="//"){
                        tape="";
                        while(k<code.length){
                            if(code[k]=="\n"){
                                break;
                            }
                            k++;
                        }
                    }else{
                        add(op);
                    }
                }else{
                    if(word=="=" && linestart==1){
                            const hold=token[token.length-1];
                            token=token.slice(0,token.length-1);
                            add("assign");
                            add(hold);
                        }else{
                    add(word);
                    }
                }
                safe=false;
                }
            }
            if(linestart>0){
            linestart--;
            }
            if(In(word,splitter)){
                reading=0;
                cut();
                safe=false;
                linestart=2;
            }
            if(word==" "){
                reading=0;
                cut();
                safe=false;
            }
            if(safe){
            tape+=word;
            startpoint=false;
            }
            if(word=="(" || word=="{" || word==","){
                startpoint=true;
            }
            if(inabs && word=="|"){
                startpoint=true;
            }
            if(word==":"){
                startpoint=true;
            }
            if(In(word,splitter)){
                if(token.length>0){
                tokens.push(token);
                token=[];
                }
                startpoint=true;
            }
        }
        cut();
        if(token.length>0){
        tokens.push(token);
        }
        for(let i=0; i<tokens.length; ++i){
            for(let k=0; k<tokens[i].length; ++k){
                if(k+1<tokens[i].length){
                    var now=tokens[i][k];
                    var next=tokens[i][k+1];
                    if(now==")" && next=="("){
                        tokens[i]=pushAt(tokens[i],k,"*");
                    }
                    if(now==")" && (!isNaN(next) || (/^[a-zA-Z]+$/.test(next) && !In(next,opcode)))){
                        tokens[i]=pushAt(tokens[i],k,"*");
                    }
                    if(!isNaN(now) && (next=="(" || /^[a-zA-Z]+$/.test(next) && !In(next,opcode))){
                        tokens[i]=pushAt(tokens[i],k,"*");
                    }
                }
            }
        }
        return tokens;
    },
    parser(tokens,imports){
        if(!imports){
            imports=[];
        }
        let locals=[];
        let token;
        let pos=0;
        function wgp(tree){
            if(tree.outgroup){
                return tree.outgroup;
            }
            return tree.group;
        }
        function guess(left,right){
            const L=left=="guess";
            const R=right=="guess";
            if(L && R){
                return "guess";
            }
            if(L && !R){
                return right;
            }
            if(!L && R){
                return left;
            }
            if(left==right){
                return left;
            }
            console.warn("違う型同士で演算を行うことはできません！");
        }
        function peek() {
            return token[pos];
        }
        function consume() {
            return token[pos++];
        }
        function expect(value) {
            if(peek()!==value){
                console.warn(`[ ${value} ]が見つかりません！`);
                if(value==":"){
                    console.warn("どの条件にも入らない場合は{~,otherwise:~}と書いてください");
                }
                blueocean.errored=true;
            }
            consume();
        }
        function parseExpression(){
            if(!blueocean.errored){
                let In;
            if(peek()=="|"){
                In="|";
            }
            let node=parseTerm();
                node.in=In;
            while(peek()==="+" || peek()==="-"){
                //+か-であるなら。
                const operator=consume();
                const right=parseTerm();
                let group=guess(wgp(node),wgp(right));
                const innergroup=group;
                if(peek()=="|" && group=="C"){
                    group="R";
                }
                node={type:"BinaryExpression",operator,left: node,right,group:innergroup,outgroup:group};
            }
            if(!node){
                console.warn(`カッコの中身がありません！`);
                blueocean.errored=true;
                return;
            }
            return node;
            }
        }
        function parseTerm(){
            let node=parseDeepTerm();
            while(peek()==="*" || peek()==="/" || peek()==="・"){
                const operator=consume();
                const right=parseDeepTerm();
                node={type:"BinaryExpression",operator,left:node,right,group:guess(wgp(node),wgp(right))};
            }
            return node;
        }
        function parseDeepTerm(){
            let node=parsePrimary();
            while(peek()==="^" || peek()==="^^" || peek()==="**" || peek()==="****" || peek()==="%" || peek()===">" || peek()==="<" || peek()==="=" || peek()==="==" || peek()==="<=" || peek()===">=" || peek()==="=/"){
                let operator=consume();
                const right=parsePrimary();
                node={type:"BinaryExpression",operator:operator,left:node,right,group:guess(wgp(node),wgp(right))};
            }
            return node;
        }
        function findRightUnary(value){
            if(peek()==="$" || peek()==="!" || peek()==="~" || peek==="°"){
                var operator=peek();
                consume();
                return {type:"UnaryExpression",operator:operator,value:value,group:wgp(value)};
            }
            if(peek() && peek().indexOf("!!")!=-1){
                let am=peek().length;
                consume();
                return {type:"UnaryExpression",operator:"multiFactorial",amount:am,value:value,group:value.group};
            }
            return value;
        }
        function parsePrimary(){
            const t = peek();
            //実数か？
            if(!isNaN(t)){
                consume();
                return findRightUnary({type:"Literal",value:Number(t),group:"guess"});
            }
            if(blueocean.opcode.indexOf(peek())!=-1){
                const op=consume();
                //オペレーション
                if(op==="print"){
                    const arg=parseExpression();
                    return {type:"print",argument:arg,group:wgp(arg)};
                }
                if(op==="consume_R"){
                    return {type:"consume_R"};
                }
                if(op==="where"){
                    //where [name] is [literal] in [type]
                    //where pi is 3.14 in R
                    //変数宣言
                    const name=consume();
                    expect("is");
                    const value=parseExpression();
                    expect("in");
                    const type=consume();
                    locals.push({name:name,group:type});
                    return {type:"decl",name:name,value:value,group:type};
                }
                if(op==="for"){
                    //for k=0--10 {call}
                    expect("(");
                    const looper=consume(); //k
                    expect("=");
                    const init=parseExpression();
                    expect("--");
                    const to=parseExpression();
                    expect(")");
                    expect("{");
                    //}にたどり着けばop.end
                    return {type:"forblock",init:init,to:to,group:"guess",looper:looper}
                }
                if(op=="whr"){
                    //whr x=10 in R
                    const name=consume();
                    expect("=");
                    const value=parseExpression();
                    let type="R";
                    if(peek()=="in"){
                        consume();
                        type=consume();
                    }
                    locals.push({name:name,group:type});
                    return {type:"decl",name:name,value:value,group:type};
                }
                if(op=="while"){
                    //while(conditions){func}
                    expect("(");
                    const cond=parseExpression();
                    expect(")");
                    expect("{");
                    return {type:"whileblock",conditions:cond,group:"guess"};
                }
                if(op=="assign"){
                    //Like~assign x 1
                    const local=consume();
                    const value=parseExpression();
                    return {type:"set",local:local,value:value,group:wgp(value)};
                }
                if(op=="fn"){
                    //fn name(...param in type){func}
                    const name=consume();
                    expect("(");
                    let param=[];
                    if(peek()!="void"){
                    while(true){
                    param.push([consume()]);
                    expect("in");
                    param[param.length-1].push(consume());
                    if(peek()==","){
                        consume();
                    }else{
                        break;
                    }
                    }
                    }else{
                        consume();
                    }
                    expect(")");
                    expect("=>");
                    const type=consume();
                    expect("{");
                    return {type:"define",name:name,param:param,group:type};
                }
                //別の関数宣言もある where f(x∈R,y∈R) is x+y∈R "∈"はinの代わりとして使えるよ。
            }
            if(t==="}"){
                //blockend
                return {type:"blockend",group:"guess"}
            }
            //数字でない場合
            if(/^[a-zA-Z-.-0-1-2-3-4-5-6-7-8-9]+$/.test(t)){
                const name = consume();
                //関数呼出しか？
                if(peek()==="(" || peek()==="'"){
                    let derivate=0;
                    while(peek()==="'"){
                        consume();
                        derivate++;
                    }
                    consume();
                    let argument=[];
                    while(true){
                        //()の中身がない場合もある。そのばあい(void)
                    if(peek()==="void"){
                        consume();
                    }else{
                    argument.push(parseExpression());
                    }
                        if(peek()!==","){
                            break;
                        }
                        consume();
                    }
                    expect(")");
                    return findRightUnary({type:"CallExpression",callee:{type:"Identifier",name},arguments:argument,derivate:derivate,group:"guess"});//outgroupにすべき
                }
                //関数でないなら変数
                if(name===undefined){
                console.warn(`構文エラー：二項演算の右辺が入力されていません。`);
                blueocean.errored=true;
                }
                let gn=locals.findIndex(e=>e.name==name);
                if(name=="i"){
                    gn="C";
                }else if(gn!=-1){
                    gn=wgp(locals[gn]);
                }else{
                    gn="guess"
                }
                let In;
                if(peek()=="|"){
                    In=peek();
                }
                return findRightUnary({type:"Identifier",name,group:gn,in:In});
            }
            //カッコなら
            if(t==="("){
                consume();
                const nodes=[];
                while(true){
                nodes.push(parseExpression());
                    if(peek()!==","){
                        break;
                    }else{
                        consume();
                    }
                }
                expect(")");
                if(nodes.length<=1){
                    return findRightUnary(nodes[0]);
                }else{
                    for(let k=0; k<nodes.length; ++k){
                        nodes[k]=findRightUnary(nodes[k]);
                    }
                    //加群
                    return {value:nodes,type:"Vector",dimention:nodes.length};
                }
            }
            //区分線形関数
            if(t==="{"){
                consume();
                const nodes=[];
                while(true){
                    let node={conditions:{},res:{}};
                    node.conditions=findRightUnary(parseExpression());
                    expect(":");
                    node.res=findRightUnary(parseExpression());
                    nodes.push(node);
                    if(peek()!==","){
                        break;
                    }else{
                        consume();
                    }
                }
                expect("}");
                return {tree:nodes,type:"PiecewiseExpression",group:"guess"};
            }
            //絶対値記号
            if(t==="|"){
                consume();
                const node = parseExpression(t);
                expect("|");
                return findRightUnary(node);
            }
            console.warn(`構文エラー:${t}が理解できません。`);
            blueocean.errored=true;
            if(t=="-"){
                console.warn(`おそらく[x*-y]のようにしていませんか？\n正しいスペル[x*(-y)]`);
            }
        }
        const ast=[];
        for(let k=0; k<tokens.length; ++k){
            token=tokens[k].slice();
            ast.push(parseExpression());
            pos=0;
        if(blueocean.errored){
            blueocean.errored=false;
            return "errorDetected";
        }
        }
        return ast;
    },
    parsedocean(code,imports){
        return this.parser(this.tokenizer(code,imports),imports);
    },
    errored:false,
    wasmStack:[],
    wasmer(midoricode,userimport){
        function bind(A,B){
            for(let k=0; k<B.length; ++k){
                A.push(B[k]);
            }
        }
        function ieee754(value,bytelength){
            if(!bytelength){
                bytelength=8;
            }
            if(value==0){
                return [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00];
            }
            let bit=[];
            let bytes=[];
            let ex=1023;
            bit.push((-Math.sign(value)+1)/2);//0,1,head
            value=Math.abs(value);
            while(value>=2){
                value*=0.5;
                ex++;
            }
            while(1>value){
                value*=2;
                ex--;
            }
            let binary=value.toString(2).slice(2);
            let exp=ex.toString(2);//指数部
            let K=0;
            for(let k=0; k<11; ++k){
                if(exp.length>=11-k){
                    bit.push(exp[K]);
                    K++;
                }else{
                    bit.push("0");
                }
            }
            for(let k=0; k<52; ++k){
                if(binary.length>k){
                    bit.push(binary[k]);
                }else{
                    bit.push("0");
                }
            }
            for(let k=7; k>=0; --k){
                bytes.push(parseInt(bit[8*k]+bit[8*k+1]+bit[8*k+2]+bit[8*k+3]+bit[8*k+4]+bit[8*k+5]+bit[8*k+6]+bit[8*k+7],2));
            }
            return bytes;
        }
        function UTFer(string){
            return new TextEncoder().encode(string);
        }
        function leb128_u(intger){
            let bin=intger.toString(2);
            let lop=7-bin.length%7;
            if(lop==7){
                lop=0;
            }
            for(let k=0; k<lop; ++k){
                bin="0"+bin;
            }
            const sp=Math.floor(bin.length/7);
            const bytes=[];
            for(let k=0; k<sp; ++k){
                if(k==0){
                bytes.push(0);
                }else{
                bytes.push(1);
                }
                for(let i=0; i<7; ++i){
                    bytes[k]+=bin[i+7*k];
                }
            }
            const res=[];
            for(let k=0; k<bytes.length; ++k){
                res.push(parseInt(bytes[bytes.length-k-1],2));
            }
            return res;
        }
        function leb128(intger){
        }
        const asts=blueocean.parsedocean(midoricode);
        //javascriptに合わせて全て倍精度計算にするよう変更。
        const f32={
            const:0x43,
            add:0x92,
            sub:0x93,
            mul:0x94,
            div:0x95,
            floor:0x8e,
            abs:0x8b,
            sqrt:0x91,
            lt:0x5d,
            le:0x5f,
            gt:0x5e,
            ge:0x60,
            eq:0x5b,
            ne:0x5c,
            ceil:0x8d,
            promote:0xbb
        }
        const f64={
            const:0x44,
            add:0xa0,
            sub:0xa1,
            mul:0xa2,
            div:0xa3,
            floor:0x9c,
            abs:0x99,
            sqrt:0x9f,
            lt:0x63,
            le:0x65,
            gt:0x64,
            ge:0x66,
            eq:0x61,
            ne:0x62,
            neg:0x9a,
            ceil:0x9b,
            demote:0xb6
        }
        const i32={
            const:0x41,
            mul:0x6c,
            eqz:0x45
        }
        const i64={
            const:0x42,
            add:0x7c,
            sub:0x7d,
            mul:0x7e,
            div_u:0x7f,
            div_s:0x80
        }
        //i64,f64,v128の並び
        const local={
            get:0x20,
            set:0x21,
            f64:[],
            i64:[],
            v128:[]
        }
        const op={
            v128:0x7b,
            f64:0x7c,
            i64:0x7e,
            f32:0x7d,
            i32:0x7f,
            end:0x0b,
            else:0x05,
            if:0x04,
            block:0x02,
            br_if:0x0d,
            br:0x0c,
            void:0x40,
            loop:0x03,
            call:0x10,
            simd:0xfd
        }
        const v128={
            const:[0xfd,0x0c],
        }
        const f64x2={
            extract:[0xfd,0x21],
            replace:[0xfd,0x22],
            add:[0xfd,0xf0,0x01],
            sub:[0xfd,0xf1,0x01],
            mul:[0xfd,0xf2,0x01],
            div:[0xfd,0xf3,0x01],
            splat:[0xfd,0x14],
        }
        function localid(name){
            const a=local.i64.findIndex(e=>e.name==name);
            if(a==-1){
                const b=local.f64.findIndex(e=>e.name==name);
                if(b==-1){
                    return `C${local.v128.findIndex(e=>e.name==name)}`
                }else{
                    return `R${b}`
                }
            }else{
                return `Z${a}`
            }
        }
        //ループカウンター変数float32timer
        // local.f64.push({name:"float64timer",group:"R"});
        //計算用の変数
        let define=[];//funとか。
        local.v128.push({name:"complex128c",group:"C"});
        const forp={
            c:localid("complex128c"),
        }
        if(!userimport){
            userimport=[];
        }
        let importamount=2;
        let imports={
        env:{
            printf:x=>console.log(x),
            printc(x,y){
                //expect c128
                if(x==0 && y!=0){
                    if(Math.abs(y)==1){
                    y="";
                    }
                    console.log(`${y}i`);
                    return;
                }
                if(y==0){
                    console.log(x);
                    return;
                }
                //x and y is not equal to zero
                let operator="+";
                if(y<0){
                    operator="-";
                }
                if(Math.abs(y)==1){
                    y="";
                }
                console.log(`${x}${operator}${y}i`);
            }
        }
    }
        const funcnde=[
            ...[0x60,0x01,op.f64,0x00],
            ...[0x60,0x02,op.f64,op.f64,0x00],
        ];
        const funcparams=[[op.f64],[op.f64,op.f64]];
        const funcresults=[[],[]];
        let typesection=1+funcnde.length+3;
        //typesection
        /*userimport=[{call:f0(x),param,result},...f1(x),f2(x),...]*/
        let envmod=[];
        const func={};
        const Functions=[0,1];
        for(const u of userimport){
        imports.env[u.call.name]=u.call;
            //typesectionに追加
            //signatureIndexはtypesectionを参照する
            //param名を翻訳
            for(let k=0; k<u.param.length; ++k){
                if(u.param[k]=="R"){
                    u.param[k]=op.f64;
                }
                if(u.param[k]=="Z" || u.param[k]=="N"){
                    u.param[k]=op.i64;
                }
                if(u.param[k]=="C"){
                    u.param[k]=op.v128;
                }
            }
            for(let k=0; k<u.result.length; ++k){
                if(u.result[k]=="R"){
                    u.result[k]=op.f64;
                }
                if(u.result[k]=="Z" || u.result[k]=="N"){
                    u.result[k]=op.i64;
                }
                if(u.result[k]=="C"){
                    u.result[k]=op.v128;
                }
            }
            //console.log(imports);
            let signature=0;
            const ip=funcparams.findIndex(e=>e.join()==u.param.join());
            const ir=funcresults.findIndex(e=>e.join()==u.result.join());
            if(ip!=ir || ip==-1 || ir==-1){
                funcparams.push(u.param);
                funcresults.push(u.result);
                signature=funcparams.length;
                const thisnde=[0x60,u.param.length,...u.param,u.result.length,...u.result];
                funcnde.push(...thisnde);
                typesection+=thisnde.length;
            }else{
                signature=ip;
            }
            Functions.push(ip);
            envmod.push(0x03,...UTFer("env"),u.call.name.length,...UTFer(u.call.name),0x00,signature);
            func[u.call.name]=importamount;
            importamount++;
        }
        let funcsignature=importamount-1;
        const defname=[];
        const defparam=[];
        const functions=[];
        const defFunctions=[];
        function createFunctions(name,params,results,locals,callstacks){ //params,results,locals,locals=[f64,f64...]
            funcsignature++;
            let funcIndex=funcparams.length;
            const ip=funcparams.findIndex(e=>e.join()==params.join());
            const ir=funcresults.findIndex(e=>e.join()==results.join());
            if(ip!=ir || ip==-1 || ir==-1){
                funcparams.push(params);
                funcresults.push(results);
                const thisnde=[0x60,params.length,...params,results.length,...results];
                funcnde.push(...thisnde);
                typesection+=thisnde.length;
            }else{
                funcIndex=ip;
            }
            func[name]=funcsignature;
            //FunctionSection
            defFunctions.push(funcIndex);
            Functions.push(funcIndex);
            //console.log({name:name,id:funcsignature,in:params,out:results,check:funcresults[funcIndex]});
            let i64c=0;
            let f64c=0;
            let v128c=0;
            for(const l of locals){
                if(l==op.i64){
                    i64c++;
                }
                if(l==op.f64){
                    f64c++;
                }
                if(l==op.v128){
                    v128c++;
                }
            }
            const localcounters=[];
            if(i64c!=0){
                localcounters.push(i64c,op.i64);
            }
            if(f64c!=0){
                localcounters.push(f64c,op.f64);
            }
            if(v128c!=0){
                localcounters.push(v128c,op.v128);
            }
            for(let k=0; k<callstacks.length; ++k){
                if(callstacks[k]=="self"){
                    callstacks[k]=funcsignature;
                }
            }
            const F=[localcounters.length/2,...localcounters,...callstacks,op.end];
            functions.push(...leb128_u(F.length),...F);
            //importあたりのことを考えると頭が痛くなる...
        }
        function aloopstart(timerid,times,up){
            const tapea=[];
                tapea.push(op.block,op.void,op.loop,op.void);
                if(up){
                tapea.push(local.get,timerid,...times,f64.eq);
                }else{
                    tapea.push(local.get,timerid,f64.const,...ieee754(0),f64.eq);
                }
                tapea.push(op.br_if,1);
            return tapea;
        }
        function aloopend(timerid,up){
            const tapea=[];
                if(up){
                tapea.push(local.get,timerid,f64.const,...ieee754(1),f64.add,local.set,timerid);
                }else{
                    tapea.push(local.get,timerid,f64.const,...ieee754(-1),f64.add,local.set,timerid);
                }
                tapea.push(op.br,0);
                tapea.push(op.end,op.end);
            return tapea;
        }
        //関数たち
        createFunctions("f64exp",[op.f64],[op.f64],[op.f64,op.f64,op.f64],[
            //精密なexp
            local.get,0,f64.const,...ieee754(0.5),f64.gt,op.if,op.f64,
            local.get,0,f64.const,...ieee754(1/8),f64.mul,
            op.call,"self",local.set,0,local.get,0,local.get,0,f64.mul,
            local.set,0,local.get,0,local.get,0,f64.mul,
            local.set,0,local.get,0,local.get,0,f64.mul,
            op.else,
            //マクローリン展開
            f64.const,...ieee754(1),local.set,1,
            f64.const,...ieee754(1),local.set,2,
            ...aloopstart(1,[f64.const,...ieee754(12)],true),
            local.get,2,local.get,0,local.get,1,f64.div,f64.mul,local.set,2,
            local.get,2,local.get,3,f64.add,local.set,3,
            ...aloopend(1,true),
            local.get,3,f64.const,...ieee754(1),f64.add,
            op.end
        ]);
        createFunctions("c128extend_f64",[op.f64],[op.v128],[],[
            //実数を複素数型に変換
            ...v128.const,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
            local.get,0,
            ...f64x2.replace,0
        ]);
        /*createFunctions("f64expfast",[op.f64],[op.f64],[],[
            //下位数桁程度の誤差。Math.expよりは遅い<-土日を使って10時間ぐらい頑張ったがどうやっても勝てない
            //fast exponential approximationは誤差が6%もでる。結局マクローリン展開が最強という結論
            //1ミリ秒に1万回くらいの速さ。
            local.get,0,f64.const,...ieee754(0.75),f64.gt,op.if,op.f64,
            local.get,0,f64.const,...ieee754(1/16),f64.mul,
            op.call,"self",local.set,0,local.get,0,local.get,0,f64.mul,
            local.set,0,local.get,0,local.get,0,f64.mul,
            local.set,0,local.get,0,local.get,0,f64.mul,
            local.set,0,local.get,0,local.get,0,f64.mul,
            op.else,
            local.get,0,
            local.get,0,
            f64.const,...ieee754(2520),local.get,0,
            f64.const,...ieee754(840),local.get,0,
            f64.const,...ieee754(210),local.get,0,
            f64.const,...ieee754(42),local.get,0,
            f64.const,...ieee754(7),local.get,0,
            f64.add,f64.mul,
            f64.add,f64.mul,
            f64.add,f64.mul,
            f64.add,f64.mul,f64.add,f64.mul,f64.mul,
            f64.const,...ieee754(0.0001984126984126984),f64.mul,local.get,0,f64.const,...ieee754(1),f64.add,f64.add,op.end
        ]);*/
        createFunctions("f64log",[op.f64],[op.f64],[op.f64,op.f64],[
            //w->0 holderp->1 timerp->2
            local.get,0,f64.const,...ieee754(6),f64.add,f64.ceil,local.set,2,
            f64.const,...ieee754(0),local.set,1,
            ...aloopstart(2),
            local.get,1,f64.const,...ieee754(1),f64.sub,
            local.get,1,f64.neg,
            op.call,func.f64exp,
            local.get,0,f64.mul,
            f64.add,local.set,1,
            ...aloopend(2),
            local.get,1
        ]);
        createFunctions("f64pown",[op.f64,op.f64],[op.f64],[op.f64],[
                local.get,1,f64.const,...ieee754(0),f64.lt,op.if,op.f64,
                f64.const,...ieee754(1),local.get,0,local.get,1,f64.abs,
                op.call,"self",f64.div,op.else,
                f64.const,...ieee754(1),local.set,2,
                ...aloopstart(1),
                local.get,2,local.get,0,f64.mul,
                local.set,2,
                ...aloopend(1),
                local.get,2,op.end
        ]);
        /*createFunctions("f64int",[op.f64,op.f64],[op.f64],[],[
            //ガウス・ルジャンドル求積
            関数を引数にする関数の作り方がわからん
        ]);//p(x)*(int f(x) dx)*q(x)*/
        createFunctions("f64pow",[op.f64,op.f64],[op.f64],[],[
            //x->0,y->1
            local.get,1,local.get,1,f64.floor,f64.eq,
            op.if,op.f64,
            local.get,0,
            local.get,1,
            op.call,func.f64pown,
            op.else,
            local.get,0,
            op.call,func.f64log,
            local.get,1,f64.mul,
            op.call,func.f64exp,
            op.end
        ]);
        createFunctions("f64mod",[op.f64,op.f64],[op.f64],[],[
            local.get,0,local.get,1,local.get,0,local.get,1,
            f64.div,f64.floor,f64.mul,f64.sub
        ]);
        createFunctions("f64negk",[op.f64],[op.f64],[],[
            //intger f64->1 or -1
            //return value is should be f64.neg or nothing? Nuh I can use value one or minus one
            local.get,0,
            f64.const,...ieee754(2),
            op.call,func.f64mod,
            f64.neg,f64.const,...ieee754(2),f64.mul,f64.const,...ieee754(1),f64.add
        ]);
        createFunctions("f64cos",[op.f64],[op.f64],[op.f64,op.f64,op.f64],[
            //x->0 holder->1 timer->2 holderp->3
            f64.const,...ieee754(1),local.set,2,f64.const,...ieee754(1),
            local.set,1,f64.const,...ieee754(1),local.set,3,
                //stack floor(x/pi+0.5)
            local.get,0,f64.const,...ieee754(0.3183098861837907),f64.mul,f64.const,...ieee754(0.5),f64.add,f64.floor,
            op.call,func.f64negk,
            f64.const,...ieee754(0.6366197723675814),local.get,0,f64.mul,f64.floor,
            op.call,func.f64negk,
            local.get,0,f64.mul,f64.const,...ieee754(1.5707963267948966),
            op.call,func.f64mod,
            local.set,0,
            ...aloopstart(2,[f64.const,...ieee754(12)],true),
            local.get,3,
            local.get,0,f64.neg,local.get,0,f64.mul,//x
            f64.const,...ieee754(2),local.get,2,f64.mul,f64.const,...ieee754(1),f64.sub,//2k-1
            f64.const,...ieee754(2),local.get,2,f64.mul,f64.mul,//2k!
            f64.div,f64.mul,local.set,3,
            local.get,1,local.get,3,f64.add,local.set,1,
            ...aloopend(2,true),
            local.get,1,f64.mul
        ]);
        createFunctions("c128mul",[op.v128,op.v128],[op.v128],[],[
            //local.get,0,local.get,1,...f64x2.mul
            local.get,0,
            local.get,1,...f64x2.extract,0,...f64x2.splat,...f64x2.mul,//c(a+bi)
            ...v128.const,...ieee754(0),...ieee754(0),//-b+ai
            local.get,0,...f64x2.extract,1,f64.neg,...f64x2.replace,0,
            local.get,0,...f64x2.extract,0,...f64x2.replace,1,
            local.get,1,...f64x2.extract,1,...f64x2.splat,...f64x2.mul,//d(-b+ai)
            ...f64x2.add
        ]);
        createFunctions("f64atan",[op.f64],[op.f64],[],[
            local.get,0,
            local.get,0,local.get,0,f64.mul,local.set,0,
            //級数
            f64.const,...ieee754(0.0506142681452),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.960684080372),f64.mul,f64.add,f64.div,
            
            f64.const,...ieee754(0.111190517227),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.807002607765),f64.mul,f64.add,f64.div,

            f64.const,...ieee754(0.156853322939),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.581812283426),f64.mul,f64.add,f64.div,

            f64.const,...ieee754(0.181341891689),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.350129388265),f64.mul,f64.add,f64.div,

            f64.const,...ieee754(0.181341891689),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.166694745769),f64.mul,f64.add,f64.div,

            f64.const,...ieee754(0.156853322939),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.05627987351),f64.mul,f64.add,f64.div,

            f64.const,...ieee754(0.111190517227),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.0103361303518),f64.mul,f64.add,f64.div,

            f64.const,...ieee754(0.0506142681452),
            f64.const,...ieee754(1),local.get,0,
            f64.const,...ieee754(0.000394223874247),f64.mul,f64.add,f64.div,

            f64.add,f64.add,f64.add,f64.add,f64.add,f64.add,f64.add,f64.mul
        ]);
        createFunctions("f64atan2",[op.f64,op.f64],[op.f64],[],[
            local.get,0,f64.const,...ieee754(0),f64.eq,
            local.get,1,f64.const,...ieee754(0),f64.eq,i32.mul,
            op.if,op.f64,f64.const,...ieee754(0),op.else,
            local.get,1,f64.const,...ieee754(0),f64.eq,local.get,0,f64.const,...ieee754(0),f64.lt,i32.mul,
            op.if,op.f64,
            f64.const,...ieee754(Math.PI),
            op.else,
            local.get,1,
            local.get,0,local.get,0,local.get,0,f64.mul,local.get,1,local.get,1,f64.mul,f64.add,f64.sqrt,f64.add,
            f64.div,
            op.call,func.f64atan,f64.const,...ieee754(2),f64.mul,
            op.end,op.end
        ]);
        createFunctions("c128abs",[op.v128],[op.v128],[],[
            //absによってf64に変換される。 x^2+y^2 sqrt
            ...v128.const,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
            local.get,0,...f64x2.extract,0,local.get,0,...f64x2.extract,0,f64.mul,
            local.get,0,...f64x2.extract,1,local.get,0,...f64x2.extract,1,f64.mul,
            f64.add,f64.sqrt,...f64x2.replace,0
        ]);
        createFunctions("c128conjugate",[op.v128],[op.v128],[],[
            local.get,0,
            local.get,0,...f64x2.extract,1,f64.neg,
            ...f64x2.replace,1
        ]);
        createFunctions("c128arg",[op.v128],[op.v128],[],[
            //複素数型->実数(ラジアン)というふうにしたい
            ...v128.const,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
            local.get,0,
            ...f64x2.extract,0,
            local.get,0,
            ...f64x2.extract,1,
            op.call,func.f64atan2,...f64x2.replace,0
        ]);
        /*createFunctions("c128div",[op.v128,op.v128],[op.v128],[],[
            local.get,0,
            local.get,1,
            op.call,func.c128conjugate,
            local.get,1,
        ]);*/
        createFunctions("f64consume",[op.f64],[],[],[
        ]);
        //console.log(func);
        let blocks=[];
        let defidentifer=[];//[[x,y]]
        function parseAST(kst,mother){
            function push(...arr){
                if(define.length==0){
                    tape.push(...arr);
                }else{
                    define[define.length-1].push(...arr);
                }
            }
            function pi(){
                push(f64.const,...ieee754(Math.PI));
            }
            function tau(){
                push(f64.const,...ieee754(Math.PI/2));
            }
            function addLocal(name,init,group){
            if(group=="R"){
                local.f64.push({name:name,group:group,id:local.f64.length});
                push(...parseAST(init,group),local.set,`R${local.f64.length-1}`);
            }
            if(group=="Z" || group=="N"){
                local.i64.push({name:name,group:group,id:local.i64.length});
                push(...parseAST(init,group),local.set,`Z${local.v128.length-1}`);
            }
            if(group=="C"){
                local.v128.push({name:name,group:group,id:local.v128.length});
                push(...parseAST(init,group),local.set,`C${local.v128.length-1}`);
            }
        }
            function createLocal(value,group){
                const seed=Math.random();
                addLocal(seed,value,group);
                return localid(seed);
            }
            let tape=[];
            if(kst.type=="Literal"){
                if(mother=="R"){
                    push(f64.const,...ieee754(kst.value));
                }
                if(mother=="Z"){
                    push(i64.const,...leb128(kst.value));
                }
                if(mother=="C"){
                    push(...v128.const,...ieee754(kst.value),0,0,0,0,0,0,0,0);
                }
            }
            if(kst.type=="Identifier"){
                //local.get
                if(kst.name=="otherwise" || kst.name=="true"){
                    push(i32.const,1);
                }else if(kst.name=="i"){
                    push(...v128.const,0,0,0,0,0,0,0,0,...ieee754(1));
                }else{
                    let id=localid(kst.name);
                    if(defidentifer.length>0){
                        const d=defidentifer[defidentifer.length-1];
                        if(d.indexOf(kst.name)!=-1){
                            id=d.indexOf(kst.name);
                        }
                    }
                    push(local.get,id);
                }
                if(kst.in=="|"){
                    if(kst.group=="R"){
                        push(f64.abs);
                    }
                    if(kst.group=="C"){
                        push(op.call,func.c128abs);
                    }
                }
            }
            if(kst.type=="decl"){
                addLocal(kst.name,kst.value,kst.group);
            }
            if(kst.type=="BinaryExpression"){
                if(kst.group=="guess"){
                    kst.group=mother;
                }
                if(kst.operator=="+"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.add);
                    }
                    if(kst.group=="Z"){
                        push(...parseAST(kst.left,"Z"),...parseAST(kst.right,"Z"),i64.add);
                    }
                    if(kst.group=="C"){
                        push(...parseAST(kst.left,"C"),...parseAST(kst.right,"C"),...f64x2.add);
                    }
                }
                if(kst.operator=="-"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.sub);
                    }
                    if(kst.group=="Z"){
                        push(...parseAST(kst.left,"Z"),...parseAST(kst.right,"Z"),i64.sub);
                    }
                    if(kst.group=="C"){
                        push(...parseAST(kst.left,"C"),...parseAST(kst.right,"C"),...f64x2.sub);
                    }
                }
                if(kst.operator=="*"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.mul);
                    }
                    if(kst.group=="Z"){
                        push(...parseAST(kst.left,"Z"),...parseAST(kst.right,"Z"),i64.mul);
                    }
                    if(kst.group=="C"){
                        //積を計算するための関数を作った方がいい。
                        push(...parseAST(kst.left,"C"));
                        push(...parseAST(kst.right,"C"));
                        push(op.call,func.c128mul);
                    }
                }
                if(kst.operator=="/"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.div);
                    }
                    if(kst.group=="Z"){
                        push(...parseAST(kst.left,"Z"),...parseAST(kst.right,"Z"),i64.div_s);
                    }
                    if(kst.group=="N"){
                        push(...parseAST(kst.left,"Z"),...parseAST(kst.right,"Z"),i64.div_u);
                    }
                }
                if(kst.operator=="^"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.left,"R"));
                        push(...parseAST(kst.right,"R"),op.call,func.f64pow);
                    }
                    if(kst.group=="Z"){
                    }
                }
                if(kst.operator=="%"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.left,"R"));
                        push(...parseAST(kst.right,"R"),op.call,func.f64mod);
                    }
                }
                //条件
                if(kst.operator=="=" || kst.operator=="=="){
                    if(kst.group=="R"){
                    push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.eq);
                    }
                }
                if(kst.operator=="<"){
                    if(kst.group=="R"){
                    push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.lt);
                    }
                }
                if(kst.operator=="<="){
                    if(kst.group=="R"){
                    push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.le);
                    }
                }
                if(kst.operator==">"){
                    if(kst.group=="R"){
                    push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.gt);
                    }
                }
                if(kst.operator==">="){
                    if(kst.group=="R"){
                    push(...parseAST(kst.left,"R"),...parseAST(kst.right,"R"),f64.ge);
                    }
                }
                if(kst.in=="|"){
                    if(kst.group=="R"){
                        push(f64.abs);
                    }
                    if(kst.group=="C"){
                        push(op.call,func.c128abs);
                    }
                }
            }
            if(kst.type=="CallExpression"){
                if(kst.group=="guess"){
                    kst.group=mother;
                }
                if(kst.callee.name=="arg"){
                    if(kst.group=="C"){
                        push(...parseAST(kst.arguments[0],"C"),op.call,func.c128arg);
                    }
                }
                if(kst.callee.name=="negk"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.arguments[0],"R"));
                        push(op.call,func.f64negk);
                    }
                }
                if(kst.callee.name=="exp"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.arguments[0],"R"));
                        push(op.call,func.f64exp);
                    }
                }
                if(kst.callee.name=="cos"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.arguments[0],"R"),op.call,func.f64cos);
                    }
                }
                if(kst.callee.name=="sin"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.arguments[0],"R"));
                        push(local.set,forp.d);
                        push(local.get,forp.d,f64.const,...ieee754(0),f64.eq,op.if,op.f64);
                        push(f64.const,...ieee754(0),op.else);
                        push(local.get,forp.d,f64.const,...ieee754(Math.PI/2));
                        push(f64.sub);
                        push(op.call,func.f64cos);
                        push(op.end);
                    }
                }
                if(kst.callee.name=="tan"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.arguments[0],"R"));
                        push(local.set,forp.d);
                        push(local.get,forp.d,f64.const,...ieee754(0),f64.eq,op.if,op.f64);
                        push(f64.const,...ieee754(0),op.else);
                        push(local.get,forp.d,f64.const,...ieee754(Math.PI/2));
                        push(f64.sub,op.call,func.f64sin);
                        push(op.end);
                        push(local.get,forp.d,op.call,func.f64cos);
                        push(f64.div);
                    }
                }
                const imp=userimport.findIndex(e=>e.call.name==kst.callee.name);
                if(imp!=-1){
                    const ui=userimport[imp];
                    for(let k=0; k<ui.param.length; ++k){
                        //op.f64など
                        if(ui.param[k]==op.f64){
                            push(...parseAST(kst.arguments[k],"R"));//ui.param[k]
                        }
                        if(ui.param[k]==op.i64){
                            push(...parseAST(kst.arguments[k],"Z"));//ui.param[k]
                        }
                        if(ui.param[k]==op.v128){
                            push(...parseAST(kst.arguments[k],"C"));//ui.param[k]
                        }
                    }
                    push(op.call,func[kst.callee.name]);
                }
                if(kst.callee.name=="arctan" || kst.callee.name=="atan"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.arguments[0],"R"));
                        push(op.call,func.f64atan);
                    }
                }
                if(kst.callee.name=="atan2"){
                    if(kst.group=="R"){
                        push(...parseAST(kst.arguments[0],"R"),...parseAST(kst.arguments[1],"R"));
                        push(op.call,func.f64atan2);
                    }
                }
                if(defname.indexOf(kst.callee.name)!=-1){
                    //arguments
                    const p=defparam[defname.indexOf(kst.callee.name)];
                    for(let k=0; k<p.length; ++k){
                        //op.f64など
                        if(p[k]==op.f64){
                            push(...parseAST(kst.arguments[k],"R"));//ui.param[k]
                        }
                        if(p[k]==op.i64){
                            push(...parseAST(kst.arguments[k],"Z"));//ui.param[k]
                        }
                        if(p[k]==op.v128){
                            push(...parseAST(kst.arguments[k],"C"));//ui.param[k]
                        }
                    }
                    push(op.call,func[kst.callee.name]);
                }
            }
            if(kst.type=="set"){
                if(kst.group=="guess"){
                    kst.group=mother;
                }
                //localtype
                push(...parseAST(kst.value,kst.group),local.set,localid(kst.local));
            }
            if(kst.type=="forblock"){
                const id=local.f64.findIndex(e=>e.name==kst.looper);
                if(id==-1){
                local.f64.push({name:kst.looper,group:"R"});
                }
                const ll=localid(kst.looper);
                push(...parseAST(kst.init,"R"),local.set,ll);
                push(op.block,op.void,op.loop,op.void);
                push(local.get,ll,...parseAST(kst.to,"R"),f64.gt);//脱出条件
                push(op.br_if,1);
                blocks.push({
                    type:"for",
                    looperid:ll
                });
            }
            if(kst.type=="whileblock"){
                push(op.block,op.void,op.loop,op.void);
                push(...parseAST(kst.conditions,"R"),i32.eqz);//脱出条件
                push(op.br_if,1);
                blocks.push({
                    type:"while"
                });
            }
            if(kst.type=="define"){
                define.push([]);
                const params=[];
                const dlocal=[];
                for(let k=0; k<kst.param.length; ++k){
                    if(kst.param[k][1]=="R"){
                        params.push(op.f64);
                    }
                    if(kst.param[k][1]=="C"){
                        params.push(op.v128);
                    }
                    if(kst.param[k][1]=="Z" || kst.param[k][1]=="N"){
                        params.push(op.i64);
                    }
                    dlocal.push(kst.param[k][0]);
                }
                if(kst.group=="void"){
                    kst.group=op.void;
                }
                if(kst.group=="R"){
                    kst.group=op.f64;
                }
                if(kst.group=="Z" || kst.group=="N"){
                    kst.group=op.i64;
                }
                if(kst.group=="C"){
                    kst.group=op.v128;
                }
                defidentifer.push(dlocal);
                blocks.push({
                    name:kst.name,
                    local:dlocal,
                    param:params,
                    result:[kst.group],
                    type:"define"
                });
            }
            if(kst.type=="blockend"){
                const b=blocks[blocks.length-1];
                if(b.type=="for"){
                push(local.get,b.looperid,f64.const,...ieee754(1),f64.add,local.set,b.looperid);
                push(op.br,0,op.end,op.end);
                }
                if(b.type=="while"){
                    push(op.br,0,op.end,op.end);
                }
                const used=[];//Rとか
                const stock=[];
                if(b.type=="define"){
                    const code=[];
                    for(let k=0; k<define[define.length-1].length; ++k){
                        const t=define[define.length-1][k];
                        if(isNaN(t)){
                            const id=stock.indexOf(t);
                            if(id==-1){
                            used.push(t[0]);
                            code.push(stock.length+b.param.length);
                                console.log();
                            stock.push(t);
                            }else{
                                code.push(id+b.param.length);
                            }
                        }else{
                        code.push(t);
                        }
                    }
                    const locals=[];
                    for(let k=0; k<used.length; ++k){
                        const u=used[k];
                        if(u=="R"){
                            locals.push(op.f64);
                        }
                        if(u=="Z" || u=="N"){
                            locals.push(op.i64);
                        }
                        if(u=="C"){
                            locals.push(op.v128);
                        }
                    }
                    defparam.push(b.param);
                    defname.push(b.name);
                    if(b.result[0]==op.void){
                        b.result=[];
                    }
                    createFunctions(b.name,b.param,b.result,locals,code);
                    defidentifer=defidentifer.slice(0,defidentifer.length-1);
                    define=define.slice(0,define.length-1);
                }
                blocks=blocks.slice(0,blocks.length-1);
            }
            if(kst.type=="consume_R"){
                push(op.call,func.f64consume);
            }
            if(kst.type=="print"){
                if(kst.group=="guess"){
                    kst.group=mother;
                }
                if(kst.group=="R"){
                    push(...parseAST(kst.argument,"R"),op.call,0);
                }
                if(kst.group=="C"){
                    push(...parseAST(kst.argument,"C"));
                    push(local.set,forp.c);
                    push(local.get,forp.c,...f64x2.extract,0);
                    push(local.get,forp.c,...f64x2.extract,1);
                    push(op.call,1);
                }
            }
            if(kst.type=="UnaryExpression"){
                if(kst.operator=="$"){
                    push(...parseAST(kst.value,"R"),f64.sqrt);
                }
                if(kst.operator=="!"){
                }
                if(kst.operator=="~"){
                    push(...parseAST(kst.value,"C"),op.call,func.c128conjugate);
                }
                if(kst.operator=="°"){
                }
                if(kst.in=="|"){
                    push(f64.abs);
                }
            }
            if(kst.type=="PiecewiseExpression"){
                function parseConditions(k){
                    push(...parseAST(kst.tree[k].conditions,"R"),op.if,op.void);
                    push(...parseAST(kst.tree[k].res,"R"),op.else);
                    if(k+1==kst.tree.length){
                    //push(f64.const,...ieee754(0));//でなければ
                    }else{
                        parseConditions(k+1);
                    }
                    push(op.end);
                }
                parseConditions(0);
            }
            return tape;
        }
        if(asts.indexOf("errorDetected")==-1){
        let code=[];
            for(const ast of asts){
        code.push(...parseAST(ast,"R"));
            }
            for(let k=0; k<code.length; ++k){
                if(isNaN(code[k])){
                    if(code[k][0]=="R"){
                        //本当はleb128_uにするべき
                        code[k]=Number(code[k].slice(1))+local.v128.length;
                    }
                    if(code[k][0]=="Z"){
                        code[k]=Number(code[k].slice(1))+local.v128.length+local.f64.length;
                    }
                    if(code[k][0]=="C"){
                        code[k]=Number(code[k].slice(1));
                    }
                }
            }
            const localtypes=[local.v128.length,op.v128,local.f64.length,op.f64,local.i64.length,op.i64];
            let declcounter=3;
            const codelength=leb128_u(code.length+2+localtypes.length);
            const binaryArray=Uint8Array.from([
        //magic
        ...[0x00, 0x61, 0x73, 0x6d],
        ...[0x01, 0x00, 0x00, 0x00],
        //type,size,functypecount
        ...[0x01,typesection,funcparams.length+1],
        //functype,param type(count,type),result type
        ...funcnde,
        ...[0x60,0x00,0x00],
        //import,size,imp count
        ...[0x02,1+13+13+envmod.length,importamount],
        //modulename,fieldname,kind(=0でfunction),signatureindex
        ...[0x03,...UTFer("env"),0x06,...UTFer("printf"),0x00,0x00],
        ...[0x03,...UTFer("env"),0x06,...UTFer("printc"),0x00,0x01],
        ...envmod,
        //Function,size,funccount,index
        ...[0x03,2+defFunctions.length,1+defFunctions.length,...defFunctions,funcparams.length],
        //exports,size,export数,名前,kind,typeindex
        ...[0x07,0x07,0x01,0x03,114,101,115,0x00,Functions.length],
        //code,size,function数
        ...[0x0a,...leb128_u(code.length+3+localtypes.length+codelength.length+functions.length),defFunctions.length+1],
        //size,local declear count,...types
        ...functions,
        ...[...codelength,...leb128_u(declcounter),...localtypes],
        ...code,op.end
    ]);
    const compiled=new WebAssembly.Instance(new WebAssembly.Module(binaryArray),imports).exports.res;
            blueocean.wasmStack.push({code:midoricode,output:compiled,input:[]});
            return compiled;
        }
        return "console.error('コンパイルに失敗:'+code)";
    },
    call(code,imports){
        const id=blueocean.wasmStack.findIndex(e=>e.code==code);
        if(id==-1){
        return blueocean.wasmer(code,imports)();
        }
        return blueocean.wasmStack[id].output();
    },
    parse(filename,imports,callback){
        fetch(filename).then(a=>{
            a.text().then(v=>{blueocean.call(v,imports); if(callback){callback()}});
        });
    }
}