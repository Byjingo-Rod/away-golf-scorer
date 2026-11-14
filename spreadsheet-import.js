(function(root){
  'use strict';
  const key=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
  function cells(line){
    const sep=line.includes('\t')?'\t':',',out=[];let value='',quoted=false;
    for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===sep&&!quoted){out.push(value.trim());value='';}else value+=ch;}
    if(quoted)throw Error('An unfinished quotation mark was found. Copy complete spreadsheet cells.');out.push(value.trim());return out;
  }
  function rows(text){if(String(text).length>1000000)throw Error('Paste no more than 1 MB at a time.');const value=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n$/,'');return value.split('\n').map((line,i)=>({line:i+1,cells:cells(line)}));}
  function parseGa(value){
    const text=String(value??'').trim().replace(/\u2212/g,'-');if(!text)return null;
    if(!/^[+-]?\d{1,2}(?:\.\d)?$/.test(text))throw Error('GA must be a number with at most one decimal place.');
    const number=text.startsWith('+')?-Number(text.slice(1)):Number(text);
    if(number < -10 || number > 54)throw Error('GA must be between plus 10 and 54.');return number;
  }
  const aliases={firstname:'firstName',first:'firstName',lastname:'lastName',surname:'lastName',last:'lastName',fullname:'name',playername:'name',name:'name',player:'name',golflink:'golfLink',golflinknumber:'golfLink',golflinkno:'golfLink',golfid:'golfLink',golfidnumber:'golfLink',registration:'golfLink',ga:'ga',gahandicap:'ga',handicap:'ga',category:'category',gender:'category',sex:'category'};
  const header=values=>values.map(v=>aliases[key(v).replace(/[^a-z]/g,'')]||'');
  const noOfficial=v=>/^(?:no official handicap|no g\/?l(?: number| no)?|no golflink(?: number)?|none)$/i.test(String(v).trim());
  function category(value){if(!String(value??'').trim())return '';if(/^(?:m|male|men|man)$/i.test(value))return 'men';if(/^(?:f|female|women|woman)$/i.test(value))return 'women';throw Error('Category must be Men or Women.');}
  function parseRoster(text){
    const input=rows(text).filter(r=>r.cells.some(v=>v!==''));if(!input.length)throw Error('Paste the player rows first.');if(input.length>2001)throw Error('Paste no more than 2,000 players.');
    const columns=header(input[0].cells),hasHeader=columns.includes('golfLink')&&(columns.includes('name')||columns.includes('firstName'));
    const starts=hasHeader?columns.map((v,i)=>v==='category'?i:-1).filter(i=>i>=0):[];
    if(starts.length>1){return starts.flatMap((start,k)=>{const end=starts[k+1]??columns.length;const block=input.map(r=>r.cells.slice(start,end));return parseRoster(block.map(r=>r.map(v=>'\"'+v.replace(/\"/g,'\"\"')+'\"').join(',')).join('\n'));});}
    const list=input.slice(hasHeader?1:0).map(({cells:f,line})=>{
      try{
        let p={};if(hasHeader){if(f.length>columns.length)throw Error('More columns than the heading row.');columns.forEach((name,i)=>{if(name)p[name]=f[i]||'';});}
        else if(/^(?:m|f|male|female|men|women)$/i.test(f[0])&&f.length===4){p={category:f[0],firstName:f[1],lastName:f[2],golfLink:f[3]};}
        else if(f.length>=3 && (/^\d+$/.test(f[1])||noOfficial(f[1]))){if(f.length>4)throw Error('Use Full Name, GolfLink, GA and optional Category.');p={name:f[0],golfLink:f[1],ga:f[2],category:f[3]};}
        else if(f.length>=3){if(f.length>5)throw Error('Use First Name, Last Name, GolfLink, optional GA and Category.');p={firstName:f[0],lastName:f[1],golfLink:f[2],ga:f[3],category:f[4]};}
        else if(f.length===2)p={name:f[0],golfLink:f[1]};else throw Error('Copy the name and GolfLink columns together.');
        if(p.name){const parts=p.name.trim().split(/\s+/);p.firstName=parts.slice(0,-1).join(' ');p.lastName=parts.at(-1);}
        p.firstName=String(p.firstName||'').trim();p.lastName=String(p.lastName||'').trim();if(!p.firstName||!p.lastName||p.firstName.length+p.lastName.length>119)throw Error('Enter a first name and last name (up to 120 characters together).');
        p.name=p.firstName+' '+p.lastName;p.noOfficialHandicap=noOfficial(p.golfLink);p.golfLink=p.noOfficialHandicap?'':String(p.golfLink||'').trim();if(!p.noOfficialHandicap&&!/^\d{1,80}$/.test(p.golfLink))throw Error('GolfLink must contain digits, or No Official Handicap. Keep the spreadsheet column as Text to preserve leading zeroes.');
        p.ga=parseGa(p.ga);if(p.noOfficialHandicap&&p.ga!==null)throw Error('Leave GA blank for No Official Handicap; set the event estimate in Set GA & Tee Hcps.');p.gaCategory=category(p.category);return {...p,line};
      }catch(e){throw Error('Line '+line+': '+e.message);}
    });if(!list.length)throw Error('No player rows were found below the headings.');return list;
  }
  function planRoster(incoming,profiles,defaultCategory='men'){
    const pool=profiles.filter(p=>!p.system&&!p.demoBatch&&!p.deleted),seen=new Set(),names=new Map();
    return incoming.map(row=>{
      const byId=row.golfLink?pool.filter(p=>String(p.golfLink||'').trim()===row.golfLink):[],byName=pool.filter(p=>key(p.name)===key(row.name));
      if(byId.length>1)throw Error('Line '+row.line+': this GolfLink number belongs to more than one saved profile. Correct the database first.');
      let existing=byId[0];if(existing&&key(existing.name)!==key(row.name))throw Error('Line '+row.line+': GolfLink matches '+existing.name+', but the pasted name is '+row.name+'. Correct the spreadsheet or saved profile.');
      if(!existing&&byName.length>1)throw Error('Line '+row.line+': name matches more than one saved player. Use an existing GolfLink number or add a middle initial.');
      if(!existing&&byName.length){
        const compatible=byName.filter(p=>row.golfLink?(!p.golfLink||p.noOfficialHandicap):(!p.golfLink||p.noOfficialHandicap));
        if(compatible.length>1 || (!row.golfLink&&byName.length!==1))throw Error('Line '+row.line+': '+row.name+' is ambiguous. Add a middle initial or GolfLink number.');
        if(!row.golfLink&&byName.some(p=>p.golfLink&&!p.noOfficialHandicap))throw Error('Line '+row.line+': the saved '+row.name+' has a GolfLink number. Include it to match this player.');
        existing=compatible[0];
      }
      const token=existing?'id:'+existing.id:row.golfLink?'gl:'+row.golfLink:'name:'+key(row.name);if(seen.has(token))throw Error('Line '+row.line+': the same player appears twice.');seen.add(token);
      const prior=names.get(key(row.name))||[];if(prior.some(p=>!p.golfLink||!row.golfLink||p.golfLink===row.golfLink))throw Error('Line '+row.line+': repeated name without distinct GolfLink numbers. Add middle initials.');prior.push(row);names.set(key(row.name),prior);
      return {...row,existingId:existing?.id||null,gaCategory:row.gaCategory||existing?.gaCategory||defaultCategory,action:existing?'Use saved player':'Add player'};
    });
  }
  function planGa(text,orderedPlayers){
    const input=rows(text);if(!input.some(r=>r.cells.some(Boolean)))throw Error('Paste the GA rows first.');const columns=header(input[0].cells),hasHeader=columns.includes('ga');
    const values=input.slice(hasHeader?1:0),oneColumn=values.every(r=>r.cells.length===1),seen=new Set();
    if(oneColumn&&values.length!==orderedPlayers.length)throw Error('A GA-only column needs exactly '+orderedPlayers.length+' rows in the displayed player order. Include blank cells for players without a GA, or paste names/GolfLink numbers with the GAs.');
    const changes=[];
    values.forEach(({cells:f,line},i)=>{
      try{
        if(!oneColumn&&!f.some(Boolean))return;let ga,match;
        if(oneColumn){match=orderedPlayers[i];ga=parseGa(f[0]);}
        else{
          let identity='',golfLink='',name='';if(hasHeader){const obj={};columns.forEach((k,j)=>obj[k]=f[j]||'');ga=parseGa(obj.ga);golfLink=obj.golfLink;name=obj.name||[obj.firstName,obj.lastName].filter(Boolean).join(' ');}
          else{if(f.length===2){identity=f[0];ga=parseGa(f[1]);}else if(f.length===3){if(/^\d+$/.test(f[1])){name=f[0];golfLink=f[1];}else name=f[0]+' '+f[1];ga=parseGa(f[2]);}else if(f.length===4){name=f[0]+' '+f[1];golfLink=f[2];ga=parseGa(f[3]);}else throw Error('Use GolfLink + GA, Full Name + GA, or First Name + Last Name + GolfLink + GA.');}
          if(ga===null)return;if(identity){if(/^\d+$/.test(identity))golfLink=identity;else name=identity;}
          if(!golfLink&&!name)throw Error('A name or GolfLink number is required.');
          const matches=orderedPlayers.filter(p=>golfLink?String(p.golfLink||'').trim()===String(golfLink).trim():key(p.name)===key(name));
          if(matches.length!==1)throw Error(matches.length?'Name is ambiguous. Include GolfLink numbers or middle initials.':'No selected player matches '+(golfLink||name)+'.');match=matches[0];if(golfLink&&name&&key(name)!==key(match.name))throw Error('GolfLink and name identify different players.');
        }
        if(ga===null)return;if(match.noOfficialHandicap)throw Error(match.name+' needs an event handicap estimate; leave this GA blank.');if(seen.has(String(match.id)))throw Error('This player appears twice.');seen.add(String(match.id));changes.push({id:String(match.id),name:match.name,ga,oldGa:match.ga??null});
      }catch(e){throw Error('Line '+line+': '+e.message);}
    });if(!changes.length)throw Error('No GA values were found to update.');return {changes,byOrder:oneColumn};
  }
  const api={cells,parseGa,parseRoster,planRoster,planGa};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GolfSpreadsheetImport=api;
})(typeof window!=='undefined'?window:globalThis);
