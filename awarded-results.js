(() => {
  "use strict";
  // Only immutable, organiser-finished event snapshots enter a season.
  function aggregate(events, members, year, drop) {
    if (!Number.isInteger(drop) || drop < 1 || drop > 5) throw Error("Choose between one and five dropped rounds.");
    const seen = new Set(), rounds = [];
    for (const event of events) {
      if (!event?.finishedAt || event.test) continue;
      for (const round of event.rounds || []) {
        if (!round.eligible || !String(round.date).startsWith(String(year) + "-")) continue;
        const key = event.eventId + ":" + round.day;
        if (seen.has(key)) throw Error("An event round was included twice.");
        seen.add(key); rounds.push({...round, eventId:event.eventId, name:event.name});
      }
    }
    rounds.sort((a,b)=>a.date.localeCompare(b.date)||a.eventId.localeCompare(b.eventId)||a.day-b.day);
    const count = Math.max(0, rounds.length - drop), ids = new Map(members.map(p=>[String(p.id),p]));
    for (const r of rounds) for (const p of r.players) if (!ids.has(String(p.id))) ids.set(String(p.id),p);
    const rows = [...ids.values()].map(member=>{
      const scores = rounds.map((round,index)=>{
        const p=round.players.find(p=>String(p.id)===String(member.id));
        if (p && (!Number.isFinite(p.points) || p.points < 0)) throw Error("An accepted Stableford result is invalid.");
        return {index,points:p?.points??0,missed:!p};
      });
      const best=[...scores].sort((a,b)=>b.points-a.points||a.index-b.index).slice(0,count), selected=new Set(best.map(s=>s.index));
      return {id:String(member.id),name:member.name,total:best.reduce((n,s)=>n+s.points,0),played:scores.filter(s=>!s.missed).length,scores:scores.map(s=>({...s,counted:selected.has(s.index)}))};
    }).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
    rows.forEach((r,i)=>r.rank=i&&r.total===rows[i-1].total?rows[i-1].rank:i+1);
    return {year,drop,count,rounds,rows}; // Annual ties share a place; no invented countback.
  }
  window.GolfAwardedResults={aggregate};
})();
