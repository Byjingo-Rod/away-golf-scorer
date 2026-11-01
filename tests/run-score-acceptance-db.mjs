// Isolated PostgreSQL tests. Install with: npm ci --prefix tests/database
// Never connects to a Supabase project or uses production rows.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('./database/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema golf_safe_private;create schema away_course_private;create schema golf_catalogue_private;
 create table auth.users(id uuid primary key default gen_random_uuid());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const tables=JSON.parse(read('supabase/schema/production-tables.json')).rows;
 const groups=new Map();
 for(const r of tables){if(!['public','golf_safe_private','away_course_private','golf_catalogue_private'].includes(r.table_schema))continue;
  const key=r.table_schema+'.'+r.table_name;const columns=groups.get(key)||[];
  columns.push(`"${r.column_name}" ${r.udt_name}${r.column_default?' default '+r.column_default:''}${r.is_nullable==='NO'?' not null':''}`);groups.set(key,columns);
 }
 for(const [key,columns] of groups)await db.exec(`create table ${key}(${columns.join(',')});`);
 const constraints=JSON.parse(read('supabase/schema/production-constraints-indexes-triggers.json')).rows;
 for(const c of constraints.sort((a,b)=>Number(a.definition.includes('REFERENCES'))-Number(b.definition.includes('REFERENCES')))){if(['golf_conflicts_event_fk','golf_corrections_event_fk'].includes(c.object_name))continue;if(c.kind!=='constraint'||!groups.has(c.schema_name+'.'+c.object_table))continue;
  if(c.definition.includes('REFERENCES')&&!c.definition.includes('REFERENCES auth.users')&&!c.definition.includes('REFERENCES away_events')&&!c.definition.includes('REFERENCES away_event_players'))continue;
  await db.exec(`alter table ${c.schema_name}.${c.object_table} add constraint "${c.object_name}" ${c.definition};`);
 }
 const functions=JSON.parse(read('supabase/schema/production-functions.json')).rows;
 for(const f of functions){if(['golf_safe_private','away_course_private'].includes(f.schema_name)||['is_away_event_organiser','away_touch_revision'].includes(f.function_name))await db.exec(f.definition+';');}
 await db.exec('create trigger away_event_touch before update on public.away_events for each row execute function public.away_touch_revision();create trigger away_score_touch before update on public.away_round_scores for each row execute function public.away_touch_revision();');
 const migration=process.argv[2]||fs.readdirSync(new URL('supabase/migrations/',root)).find(n=>n.endsWith('_score_acceptance_published_methods.sql'));
 assert(migration,'score acceptance migration must be supplied or present');
 const sql=process.argv[2]?fs.readFileSync(migration,'utf8'):read('supabase/migrations/'+migration);
 await db.exec(sql);
 if(!process.argv[2])for(const name of fs.readdirSync(new URL('supabase/migrations/',root)).filter(n=>n.endsWith('_archive_and_permission_guards.sql')).sort())await db.exec(read('supabase/migrations/'+name));
 await db.exec(read('supabase/tests/score-acceptance.sql'));
 console.log('Isolated PostgreSQL: synthetic scoring-method, marker, pickup, putts, plus/dual handicap, category, invalid-total and private-grant assertions passed.');
 if(fs.existsSync(new URL('supabase/tests/score-acceptance-rpc.sql',root))){await db.exec(read('supabase/tests/score-acceptance-rpc.sql'));console.log('Isolated PostgreSQL: four-player RPC, stale revisions, completed-card protection, outsider denial, audited correction and full-card/final totals passed.');}
 console.log('Isolated PostgreSQL version:',(await db.query('select version() as version')).rows[0].version);
}catch(error){console.error('Isolated PostgreSQL check failed:',error.message,error.where||'');process.exitCode=1;}finally{await db.close();}
