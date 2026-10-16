import assert from 'node:assert/strict';
import {playerDetails,matches,saveArguments,states} from '../products/golf-event-scorer-assets/roster-model.mjs';
const row={id:'player-1',revision:7,name:'Rod Ruston',details:{nickname:'Rusty',registration:'123456',notes:'Preserved',addressDetails:{state:'NSW',postCode:'2000'}},active:true};
assert.equal(playerDetails(row).firstName,'Rod');assert.equal(playerDetails(row).lastName,'Ruston');
assert.equal(matches(row,'rusty'),true);assert.equal(matches(row,'123456'),true);assert.equal(matches(row,'unrelated'),false);
const args=saveArguments('group-1',row,playerDetails(row),null,false);assert.equal(args.p_expected_revision,7);assert.equal(args.p_group_id,'group-1');assert.equal(args.p_active,false);assert.equal(args.p_details.notes,'Preserved');assert.equal(args.p_details.addressDetails.postCode,'2000');assert.equal(states.length,8);
assert.equal(saveArguments('group-1',{id:'new'},playerDetails(null),null,true).p_expected_revision,0);
console.log('Roster field preservation, search and optimistic save arguments passed');
