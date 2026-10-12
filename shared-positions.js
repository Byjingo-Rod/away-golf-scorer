/* Planned shared positions retain real golfer IDs on daily scorecards. */
(() => {
 'use strict';
 function position(event,id){id=String(id);for(const [slot,days] of Object.entries(event?.sharedPositions||{}))if(slot===id||Object.values(days).map(String).includes(id))return slot;return id;}
 function actual(event,id,day){const slot=position(event,id);return String(event?.sharedPositions?.[slot]?.['day'+day] || id);}
 function members(event,slot){return [...new Set(Object.values(event?.sharedPositions?.[String(slot)]||{}).map(String))];}
 function label(event,id,name){const slot=position(event,id),ids=members(event,slot);return ids.length?ids.map(name).join(' / '):name(id);}
 function assign(event,slot,days,selected){
  slot=String(slot);if(event.locked || event.previewPublishedAt || event.finalUpdateCloudSentAt)throw Error('Shared positions must be arranged before publication.');
  if(+event.days<2)throw Error('A shared position needs a multi-day event.');
  if(!selected.map(String).includes(slot))throw Error('Choose a selected player’s position.');
  const clean={};for(let day=1;day<=event.days;day++){const id=String(days['day'+day]||'');if(!id)throw Error('Assign a golfer to every day.');clean['day'+day]=id;}
  const ids=[...new Set(Object.values(clean))];if(ids.length<2 || !ids.includes(slot))throw Error('Assign both golfers, including the selected player, to at least one day.');
  for(const id of ids){if(id!==slot&&selected.map(String).includes(id))throw Error('The second golfer already has a separate position. Remove that separate selection first.');for(const [other,map] of Object.entries(event.sharedPositions||{}))if(other!==slot&&(other===id||Object.values(map).map(String).includes(id)))throw Error('A golfer cannot share two positions.');}
  return {...event,sharedPositions:{...(event.sharedPositions||{}),[slot]:clean}};
 }
 window.GolfSharedPositions={position,actual,members,label,assign};
})();
