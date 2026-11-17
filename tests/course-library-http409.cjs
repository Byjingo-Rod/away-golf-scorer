const {execFileSync}=require('node:child_process');
execFileSync(process.execPath,['tests/course-library.cjs'],{env:{...process.env,GOLF_CONFLICT_CODE:'PT409'},stdio:'inherit'});
