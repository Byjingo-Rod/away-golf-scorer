/* Event positions retain score identity; the actual golfer is recorded per round. */
(() => {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const identity = p => ({id:String(p.id), name:p.name, ga:p.ga, gaCategory:p.gaCategory || 'men', noOfficialHandicap:Boolean(p.noOfficialHandicap)});
  function history(event, id) { return event?.playerSubstitutions?.[String(id)] || []; }
  function occupant(event, id, base, day) {
    const records = history(event, id);
    if (!records.length) return base;
    let person = records[0].previous;
    for (const record of records) if (day == null || +day >= record.fromDay) person = record.replacement;
    return {...person, id:String(id), profileId:person.id};
  }
  function aggregateName(event, id, fallback) {
    const records = history(event, id);
    return records.length ? [...(records[0].fromDay > 1 || records[0].retainPreviousName ? [records[0].previous.name] : []), ...records.map(r => r.replacement.name)].join(' / ') : fallback;
  }
  function prepare(event, id, replacement, fromDay, options) {
    if (!event?.locked) throw Error('Lock and publish the event before using Replace Player.');
    const day = +fromDay, slot = String(id);
    if (!Number.isInteger(day) || day < 1 || day > +event.days) throw Error('Choose a valid first round for the substitute.');
    if (!(options.field(day) || []).map(String).includes(slot)) throw Error('The selected player is not playing that round.');
    const records = history(event, slot);
    if (records.length && day <= records.at(-1).fromDay) throw Error('A later substitution must start after the previous substitution round.');
    if (!replacement?.id || !String(replacement.name || '').trim()) throw Error('Enter the substitute’s name.');
    if (replacement.ga === '' || replacement.ga == null || !Number.isFinite(+replacement.ga) || +replacement.ga < -10 || +replacement.ga > 54) throw Error('Enter a GA Handicap from plus 10 to 54.');
    if (String(replacement.id) === slot || options.usedProfile(String(replacement.id))) throw Error('This golfer already has a position in this event. Choose a different substitute.');
    for (let d=1; d<day; d++) if (!options.complete(d)) throw Error('Complete the earlier rounds before substituting a player for a later round.');
    if (String(event.capTeams?.virtualPlayer)===slot) throw Error("This position supplies virtual cap-team scores. Resolve it with the event owner first.");
    const calculated = {};
    for (let d=day; d<=event.days; d++) {
      if (options.started(d)) throw Error('Scoring has already begun in an affected round. A substitution cannot change that round.');
      if (String(event.emergencyReplacements?.['day'+d]?.missingPlayerId) === slot || String(event.emergencyReplacements?.['day'+d]?.virtualPlayerId) === slot || Object.values(event.groupSetup?.['day'+d]?.shortTeams || {}).some(t=>String(t.virtualPlayer)===slot)) throw Error('This position is involved in a virtual-player replacement. Resolve it with the event owner first.');
      calculated['day'+d] = {};
      for (const tee of options.tees(d)) {
        const hcp = options.calculate(d, tee, +replacement.ga, replacement.gaCategory || 'men');
        if (hcp == null || !Number.isFinite(hcp)) throw Error('Course ratings are incomplete for Day '+d+' — '+tee+'. Complete the ratings before substituting.');
        calculated['day'+d][tee] = hcp;
      }
    }
    const result=copy(event), previous=copy(occupant(event,slot,options.base,day));
    // Store the profile identity, not the event-position alias.
    previous.id = previous.profileId || previous.id; delete previous.profileId;
    result.playerSubstitutions ||= {};
    result.playerSubstitutions[slot] = [...copy(records), {fromDay:day, retainPreviousName:day>1 || Boolean(options.scorecardsOpened), previous:identity(previous), replacement:identity(replacement), ...(replacement.handicapEstimate ? {handicapEstimate:copy(replacement.handicapEstimate)} : {}), at:options.at}];
    result.gaHandicaps ||= {}; result.gaHandicaps[slot]=+replacement.ga;
    result.gaCategories ||= {}; result.gaCategories[slot]=replacement.gaCategory || 'men';
    result.teeHandicaps ||= {}; result.teeHandicapSources ||= {}; result.dailyHandicaps ||= {};
    for (const [key,tees] of Object.entries(calculated)) {
      result.teeHandicaps[key] ||= {}; result.teeHandicapSources[key] ||= {};
      for (const [tee,hcp] of Object.entries(tees)) {
        result.teeHandicaps[key][tee] ||= {}; result.teeHandicaps[key][tee][slot]=hcp;
        result.teeHandicapSources[key][tee] ||= {}; result.teeHandicapSources[key][tee][slot]='substitution';
      }
      result.dailyHandicaps[key] ||= {};
      const selected=result.teeSelection?.[key] || (Object.hasOwn(tees,'middle') ? 'middle' : Object.keys(tees)[0]);
      result.dailyHandicaps[key][slot]=tees[selected];
    }
    result.realPlayerSubstitutionPending={slot,fromDay:day,name:replacement.name,at:options.at};
    delete result.finalUpdateCloudSentAt;
    return result;
  }
  window.GolfPlayerSubstitution={history,occupant,aggregateName,prepare};
})();
