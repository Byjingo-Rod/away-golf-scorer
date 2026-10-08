/* Shared course-location vocabulary. No world-wide country seed. */
(() => {
  const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
  const unique = values => [...new Map(values.map(clean).filter(Boolean).map(v => [v.toLowerCase(), v])).values()].sort((a,b) => a.localeCompare(b));
  const regions = ['Bathurst/Orange','Canberra','Hunter Valley','Port Stephens','South Coast','Sydney','Wollongong'];
  const states = ['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'];
  window.GolfCourseLocations = {clean,unique,regions,states,
    countries: (courses, saved=[]) => unique(['Australia',...saved,...courses.map(c => c.country)]),
    areas: (country, courses, saved=[]) => unique([...(clean(country||'Australia').toLowerCase()==='australia'?regions:[]),...saved,...courses.filter(c=>clean(c.country||'Australia').toLowerCase()===clean(country||'Australia').toLowerCase()).map(c=>c.region)]),
  };
})();
