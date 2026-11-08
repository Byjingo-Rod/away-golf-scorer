(function () {
  "use strict";
  window.AwayGolfDevelopmentTests = {
    create(api) {
      const {
        store, $, $$, NO_PARTNER_ID, version, stablefordPoints, player,
        writeLocalStore, renderHome, nav, closeCloudConnection,
        renderCoursesAdmin, watchCloudEvent, syncCloudNow, course,
        dayFieldIds, playerDailyHandicap, stablefordStrokeCount,
        renderLeaderboard, renderPlayerExperience,
      } = api;
      const OATLANDS_TEST_IDS = [
        "p42",
        "p11",
        "p27",
        "p6",
        "p2",
        "p17",
        "p49",
        "p1",
      ];
      const OATLANDS_SIXTEEN_IDS = [
        ...OATLANDS_TEST_IDS,
        "p3",
        "p4",
        "p5",
        "p7",
        "p8",
        "p9",
        "p12",
        "p13",
      ];
      const OATLANDS_TEST_GROSS = {
        day1: {
          p42: [6, 4, 5, 7, 4, 7, 4, 6, 7, 5, 6, 6, 4, 7, 6, 6, 6, 5],
          p11: [5, 5, 6, 7, 5, 5, 4, 7, 6, 5, 4, 4, 3, 6, 5, 6, 5, 6],
          p27: [6, 4, 6, 5, 5, 5, 3, 5, 7, 4, 6, 5, 4, 8, 4, 7, 7, 5],
          p6: [5, 4, 4, 5, 4, 5, 4, 5, 6, 6, 5, 7, 3, 8, 5, 5, 6, 6],
          p2: [6, 3, 5, 7, 6, 6, 3, 7, 8, 5, 5, 6, 4, 8, 6, 7, 5, 6],
          p17: [7, 4, 6, 6, 3, 7, 3, 5, 6, 4, 5, 5, 3, 8, 5, 6, 4, 6],
          p49: [4, 3, 5, 4, 4, 4, 3, 4, 6, 6, 4, 6, 3, 5, 4, 6, 5, 5],
          p1: [4, 3, 6, 6, 4, 4, 3, 4, 7, 3, 4, 5, 4, 4, 6, 5, 4, 4],
        },
        day2: {
          p42: [6, 5, 7, 6, 6, 6, 4, 5, 6, 4, 5, 7, 5, 6, 7, 6, 6, 6],
          p11: [5, 4, 6, 5, 4, 5, 4, 7, 5, 6, 5, 5, 4, 8, 6, 6, 7, 6],
          p27: [4, 4, 5, 4, 4, 6, 3, 4, 8, 4, 5, 6, 5, 5, 7, 6, 6, 7],
          p6: [7, 5, 5, 5, 5, 5, 4, 6, 6, 4, 5, 5, 4, 7, 7, 6, 5, 7],
          p2: [6, 4, 6, 5, 5, 6, 3, 5, 4, 3, 5, 6, 7, 6, 5, 6, 3, 5],
          p17: [4, 3, 6, 6, 4, 4, 3, 4, 7, 3, 4, 5, 4, 4, 6, 5, 4, 4],
          p49: [5, 4, 5, 4, 5, 6, 3, 4, 7, 4, 5, 6, 4, 6, 6, 5, 6, 6],
          p1: [6, 4, 5, 6, 4, 5, 4, 6, 7, 4, 6, 5, 4, 7, 5, 7, 6, 5],
        },
      };
      const OATLANDS_TEST_HCP = {
        day1: {
          p42: 28,
          p11: 19,
          p27: 26,
          p6: 17,
          p2: 22,
          p17: 17,
          p49: 5,
          p1: 10,
        },
        day2: {
          p42: 28,
          p11: 18,
          p27: 21,
          p6: 16,
          p2: 14,
          p17: 10,
          p49: 17,
          p1: 22,
        },
      };
      Object.assign(OATLANDS_TEST_HCP.day1, {
        p3: 15,
        p4: 12,
        p5: 23,
        p7: 18,
        p8: 20,
        p9: 11,
        p12: 16,
        p13: 25,
      });
      Object.assign(OATLANDS_TEST_HCP.day2, {
        p3: 15,
        p4: 12,
        p5: 23,
        p7: 18,
        p8: 20,
        p9: 11,
        p12: 16,
        p13: 25,
      });
      const OATLANDS_EXTRA_BASE = {
        p3: "p1",
        p4: "p49",
        p5: "p42",
        p7: "p11",
        p8: "p27",
        p9: "p6",
        p12: "p2",
        p13: "p17",
      };
      function testGross(day, id) {
        const key = "day" + day;
        if (OATLANDS_TEST_GROSS[key][id]) return OATLANDS_TEST_GROSS[key][id];
        const base = OATLANDS_TEST_GROSS[key][OATLANDS_EXTRA_BASE[id]],
          seed = OATLANDS_SIXTEEN_IDS.indexOf(id);
        return base.map((g, i) =>
          Math.max(
            2,
            g + ((i + seed * 2) % 7 === 0 ? 1 : (i + seed) % 11 === 0 ? -1 : 0),
          ),
        );
      }
      function testCourse() {
        return (
          store.courses.find((c) => c.id === "test-oatlands-full-rounds") ||
          store.courses.find((c) => /oatlands/i.test(c.name)) ||
          store.courses[0]
        );
      }
      function installTestCourse() {
        if (store.courses.some((c) => c.id === "test-oatlands-full-rounds")) return;
        const source = testCourse(),
          base = JSON.parse(JSON.stringify(source)),
          v = version(base) || {};
        base.id = "test-oatlands-full-rounds";
        base.name = "Oatlands GC — Test Card";
        base.available = true;
        base.versions = [
          {
            ...v,
            id: "test-oatlands-full-rounds-v1",
            par: [4, 3, 4, 4, 3, 4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 5, 4, 4],
          },
        ];
        base.activeVersionId = "test-oatlands-full-rounds-v1";
        store.courses.push(base);
      }
      function testPutts(gross, par, points, hole, seed) {
        if (points >= 3 || gross <= par) return 1;
        if (points === 0 || gross >= par + 3) return 3;
        return gross >= par + 2 && (hole + seed) % 4 === 0 ? 3 : 2;
      }
      function makeTestDayScoring(day, groups) {
        const key = "day" + day,
          c = testCourse(),
          v = version(c) || {},
          scores = {},
          hcp = OATLANDS_TEST_HCP[key],
          ids = groups.flat().filter((id) => id !== NO_PARTNER_ID);
        ids.forEach((id) => (scores[id] = {}));
        const partner = {};
        groups.forEach((g) => {
          for (let i = 0; i < g.length; i += 2) {
            partner[g[i]] = g[i + 1];
            partner[g[i + 1]] = g[i];
          }
        });
        ids.forEach((id, seed) => {
          const gross = testGross(day, id);
          for (let h = 1; h <= 18; h++) {
            const g = gross[h - 1],
              par = +(
                v.par?.[h - 1] ||
                [4, 3, 4, 4, 3, 4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 5, 4, 4][h - 1]
              ),
              pts = stablefordPoints(g, par, v.index?.[h - 1] ?? "", hcp[id]),
              putts = testPutts(g, par, pts, h, seed);
            scores[id][h] = {
              self: { playerId: id, gross: g, putts },
              official: {
                playerId: partner[id],
                gross: testGross(day, partner[id])[h - 1],
                putts: 0,
              },
              ntp: {},
            };
          }
          scores[id]._meta = {
            finalisedAt: `2026-08-${day === 1 ? "08" : "09"}T08:00:00.000Z`,
          };
        });
        // The marker's official putts must match the marked player's self putts.
        ids.forEach((id) => {
          for (let h = 1; h <= 18; h++)
            scores[id][h].official.putts = scores[partner[id]][h].self.putts;
        });
        const ntps =
          day === 1 && store.event?.ntpJackpot
            ? []
            : day === 1
            ? [
                {
                  hole: 2,
                  winner: "p42",
                  scorer: "p11",
                  at: "2026-08-08T09:24:00+10:00",
                },
                {
                  hole: 2,
                  winner: "p27",
                  scorer: "p6",
                  at: "2026-08-08T10:15:00+10:00",
                },
                {
                  hole: 2,
                  winner: "p2",
                  scorer: "p17",
                  at: "2026-08-08T11:02:00+10:00",
                },
              ]
            : [
                {
                  hole: 5,
                  winner: "p42",
                  scorer: "p27",
                  at: "2026-08-09T09:18:00+10:00",
                },
                {
                  hole: 5,
                  winner: "p27",
                  scorer: "p2",
                  at: "2026-08-09T10:41:00+10:00",
                },
                {
                  hole: 10,
                  winner: "p6",
                  scorer: "p17",
                  at: "2026-08-09T09:46:00+10:00",
                },
                {
                  hole: 10,
                  winner: "p11",
                  scorer: "p1",
                  at: "2026-08-09T11:07:00+10:00",
                },
              ];
        ntps.forEach((n) => {
          scores[n.scorer][n.hole].ntp = {
            entrantId: n.winner,
            confirmedAt: n.at,
            locked: true,
          };
        });
        return scores;
      }
      function buildOatlandsTestEvent() {
        const c = testCourse(),
          d1 = [
            ["p42", "p11", "p27", "p6"],
            ["p2", "p17", "p49", "p1"],
          ],
          d2 = [
            ["p42", "p27", "p2", "p49"],
            ["p11", "p6", "p17", "p1"],
          ];
        return {
          name: "TEST — Oatlands Two-Day Championship",
          date: "2026-08-08",
          days: 2,
          testMode: true,
          status: "locked",
          locked: true,
          lockedAt: new Date().toISOString(),
          startMethod: "single",
          startMethods: { day1: "single", day2: "single" },
          startHoles: { day1: [1], day2: [13] },
          course1: c.id,
          course2: c.id,
          fieldSize: 8,
          confirmed: [...OATLANDS_TEST_IDS],
          dayFields: { day1: [...OATLANDS_TEST_IDS], day2: [...OATLANDS_TEST_IDS] },
          dayAvailability: Object.fromEntries(
            OATLANDS_TEST_IDS.map((id) => [id, { 1: true, 2: true }]),
          ),
          competitions: [
            "combined",
            "fourball",
            "teamPutts",
            "best3of4",
            "par3",
            "ntp",
            "scratch",
            "eclectic",
          ],
          singleStablefordFormat: "aggregate",
          puttingFormat: "team",
          par3Format: "aggregate",
          ntpDay2Count: 2,
          ntpJackpot: true,
          ntpSelections: { day1: [2], day2: [5, 10] },
          benefits: {
            combined: { balls: 3, plus: true },
            fourball: { balls: 3 },
            teamPutts: { balls: 2 },
            best3of4: { mode: "lottery", contribution: 10 },
            par3: { balls: 2 },
            ntp: { balls: 4 },
            scratch: { balls: 3 },
            eclectic: { balls: 3 },
          },
          specialRules:
            "TEST EVENT — scores are based on genuine Oatlands rounds. Missing historical scores and putts have been completed with realistic test values.",
          dailyHandicaps: JSON.parse(JSON.stringify(OATLANDS_TEST_HCP)),
          groupSetup: {
            day1: { groups: d1, starts: [1, 1], saved: true },
            day2: { groups: d2, starts: [13, 13], saved: true },
          },
          roundFinalised: { day1: {}, day2: {} },
          scoring: { day1: {}, day2: {} },
          liveControlDay: 1,
          leaderboardView: "summary",
        };
      }
      function buildOatlandsOneDayTestEvent() {
        const e = buildOatlandsTestEvent();
        e.name = "TEST — Oatlands One-Day Championship";
        e.days = 1;
        e.testKind = "oneDay";
        e.competitions = [
          "single",
          "fourball",
          "teamPutts",
          "best3of4",
          "par3",
          "ntp",
          "scratch",
        ];
        e.benefits = {
          single: { balls: 3, plus: true },
          fourball: { balls: 3 },
          teamPutts: { balls: 2 },
          best3of4: { mode: "lottery", contribution: 10 },
          par3: { balls: 2 },
          ntp: { balls: 2 },
          scratch: { balls: 3 },
        };
        e.par3Format = "daily";
        e.ntpSelections = { day1: [2] };
        e.groupSetup = { day1: e.groupSetup.day1 };
        e.dayFields = { day1: [...OATLANDS_TEST_IDS] };
        e.scoring = { day1: {} };
        e.roundFinalised = { day1: {} };
        e.liveControlDay = 1;
        e.leaderboardView = "summary";
        delete e.course2;
        delete e.singleStablefordFormat;
        return e;
      }
      function buildOatlandsSixteenPlayerTestEvent() {
        const e = buildOatlandsOneDayTestEvent(),
          ids = [...OATLANDS_SIXTEEN_IDS],
          groups = [
            ids.slice(0, 4),
            ids.slice(4, 8),
            ids.slice(8, 12),
            ids.slice(12, 16),
          ];
        e.name = "TEST — Oatlands 16-Player Dress Rehearsal";
        e.testKind = "sixteen";
        e.fieldSize = 16;
        e.confirmed = ids;
        e.dayFields = { day1: ids };
        e.dayAvailability = Object.fromEntries(ids.map((id) => [id, { 1: true }]));
        e.dailyHandicaps = {
          day1: Object.fromEntries(
            ids.map((id) => [id, OATLANDS_TEST_HCP.day1[id]]),
          ),
        };
        e.groupSetup = { day1: { groups, starts: [1, 1, 1, 1], saved: true } };
        e.specialRules =
          "PROTECTED 16-PLAYER DRESS REHEARSAL — four groups, eight 4BBB pairs and every one-day competition. Test data is local and cannot be published.";
        return e;
      }
      function loadTestStage(stage) {
        const e = store.event;
        if (!e?.testMode) return;
        e.scoring = { day1: {}, day2: {} };
        e.roundFinalised = { day1: {}, day2: {} };
        e.prizesAwarded = {};
        const ids = e.dayFields?.day1 || e.confirmed || [];
        if (stage >= 1) {
          e.scoring.day1 = makeTestDayScoring(1, e.groupSetup.day1.groups);
          ids.forEach(
            (id) =>
              (e.roundFinalised.day1[id] = e.scoring.day1[id]._meta.finalisedAt),
          );
        }
        if (stage >= 2 && e.days === 2) {
          e.scoring.day2 = makeTestDayScoring(2, e.groupSetup.day2.groups);
          (e.dayFields?.day2 || ids).forEach(
            (id) =>
              (e.roundFinalised.day2[id] = e.scoring.day2[id]._meta.finalisedAt),
          );
        }
        store.cloudPlayers =
          e.testKind === "sixteen"
            ? ids.map((id, i) => ({
                playerId: id,
                name: player(id)?.name || id,
                joined: true,
                joinedAt: `2026-08-08T${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 7).padStart(2, "0")}:00.000Z`,
              }))
            : [];
        e.liveControlDay = stage >= 2 && e.days === 2 ? 2 : 1;
        e.leaderboardView = "summary";
        writeLocalStore();
        $("#modalShade").classList.remove("open");
        renderHome();
        nav("home");
      }
      function beginOatlandsTest(kind = "twoDay") {
        const label =
          kind === "sixteen"
            ? "16-player one-day dress rehearsal"
            : `eight-player ${kind === "oneDay" ? "one-day" : "two-day"} Oatlands test`;
        if (
          !confirm(
            `Load the protected ${label}? Your current event and cloud connection will be saved for restoration.`,
          )
        )
          return;
        if (!localStorage.getItem("awayGolfTestBackupV1"))
          localStorage.setItem(
            "awayGolfTestBackupV1",
            JSON.stringify({
              event: store.event || null,
              cloud: store.cloud || null,
              cloudPlayers: store.cloudPlayers || [],
              courses: store.courses,
            }),
          );
        closeCloudConnection();
        delete store.cloud;
        store.cloudPlayers = [];
        installTestCourse();
        store.event =
          kind === "sixteen"
            ? buildOatlandsSixteenPlayerTestEvent()
            : kind === "oneDay"
              ? buildOatlandsOneDayTestEvent()
              : buildOatlandsTestEvent();
        loadTestStage(1);
      }
      function switchOatlandsTest(kind) {
        const label =
          kind === "sixteen"
            ? "16-player one-day dress rehearsal"
            : `eight-player ${kind === "oneDay" ? "one-day" : "two-day"} test`;
        if (
          !confirm(
            `Switch to the protected ${label}? Current test scores and awarded test prizes will be replaced.`,
          )
        )
          return;
        installTestCourse();
        store.event =
          kind === "sixteen"
            ? buildOatlandsSixteenPlayerTestEvent()
            : kind === "oneDay"
              ? buildOatlandsOneDayTestEvent()
              : buildOatlandsTestEvent();
        loadTestStage(1);
      }
      function restoreBeforeTest() {
        let backup;
        try {
          backup = JSON.parse(
            localStorage.getItem("awayGolfTestBackupV1") || "null",
          );
        } catch (_) {
          backup = null;
        }
        if (!backup) return alert("No saved event was found.");
        if (!confirm("Restore the event that was open before the Oatlands test?"))
          return;
        store.event = backup.event;
        store.cloud = backup.cloud;
        store.cloudPlayers = backup.cloudPlayers || [];
        if (backup.courses) store.courses = backup.courses;
        else
          store.courses = store.courses.filter(
            (c) => c.id !== "test-oatlands-full-rounds",
          );
        localStorage.removeItem("awayGolfTestBackupV1");
        writeLocalStore();
        $("#modalShade").classList.remove("open");
        renderHome();
        renderCoursesAdmin();
        if (store.cloud?.eventId) {
          watchCloudEvent();
          syncCloudNow();
        }
        nav("home");
      }
      const RIDGE_TEST_TOTALS = {
        "Example Golfer 38": 40,
        "Example Golfer 48": 38,
        "Example Golfer 26": 37,
        "Example Golfer 12": 36,
        "Example Golfer 27": 36,
        "Example Golfer 40": 35,
        "Example Golfer 01": 35,
        "Example Golfer 43": 34,
        "Example Golfer 06": 34,
        "Example Golfer 11": 34,
        "Example Golfer 17": 33,
        "Example Golfer 30": 32,
        "Example Golfer 37": 31,
        "Example Golfer 46": 30,
        "Example Golfer 04": 27,
        "Example Golfer 42": 25,
      };
      const RIDGE_TEST_PUTTS = {
        "Example Golfer 38": 28,
        "Example Golfer 48": 31,
        "Example Golfer 26": 30,
        "Example Golfer 12": 30,
        "Example Golfer 27": 30,
        "Example Golfer 40": 32,
        "Example Golfer 01": 32,
        "Example Golfer 43": 32,
        "Example Golfer 06": 33,
        "Example Golfer 11": 34,
        "Example Golfer 17": 33,
        "Example Golfer 30": 31,
        "Example Golfer 37": 31,
        "Example Golfer 46": 35,
        "Example Golfer 04": 35,
        "Example Golfer 42": 37,
      };
      function ridgeTestEligible() {
        const e = store.event,
          c = course(e?.course1),
          ids = dayFieldIds(1).filter((id) => String(id) !== NO_PARTNER_ID);
        return Boolean(
          e?.locked &&
            e?.days === 1 &&
            ids.length === 16 &&
            /ridge/i.test(c?.name || ""),
        );
      }
      function ridgePointPattern(name, target, seed) {
        if (name.toLowerCase() === "Example Golfer 42")
          return [1, 0, 2, 1, 2, 1, 2, 3, 2, 1, 2, 1, 0, 2, 2, 0, 2, 1];
        const out = Array(18).fill(2),
          order = Array.from(
            { length: 18 },
            (_, i) => (i * 7 + seed * 5) % 18,
          ).filter((x, i, a) => a.indexOf(x) === i);
        let delta = target - 36,
          n = 0;
        while (delta > 0) {
          const i = order[n++ % order.length];
          if (out[i] < 4) {
            out[i]++;
            delta--;
          }
        }
        while (delta < 0) {
          const i = order[n++ % order.length];
          if (out[i] > 0) {
            out[i]--;
            delta++;
          }
        }
        return out;
      }
      function ridgePuttPattern(name, target, points, seed) {
        const out = Array(18).fill(2),
          good = Array.from({ length: 18 }, (_, i) => i).sort(
            (a, b) =>
              points[b] - points[a] || ((a + seed) % 18) - ((b + seed) % 18),
          ),
          bad = [...good].reverse();
        let delta = target - 36,
          n = 0;
        while (delta < 0) {
          const i = good[n++ % 18];
          if (out[i] > 1) {
            out[i]--;
            delta++;
          }
        }
        n = 0;
        while (delta > 0) {
          const i = bad[n++ % 18];
          if (out[i] < 3) {
            out[i]++;
            delta--;
          }
        }
        return out;
      }
      function makeRidgeTestScoring() {
        const e = store.event,
          groups = e.groupSetup?.day1?.groups || [],
          ids = groups
            .flat()
            .map(String)
            .filter((id) => id !== NO_PARTNER_ID),
          c = course(e.course1),
          v = version(c) || {},
          scores = {},
          partner = {};
        groups.forEach((raw) => {
          const g = raw.map(String);
          for (let i = 0; i < g.length; i += 2) {
            if (g[i] && g[i + 1]) {
              partner[g[i]] = g[i + 1];
              partner[g[i + 1]] = g[i];
            }
          }
        });
        ids.forEach((id, seed) => {
          const name = (player(id)?.name || "").trim(),
            key = name.toLowerCase(),
            target = RIDGE_TEST_TOTALS[key] ?? 30 + ((seed * 7) % 9),
            points = ridgePointPattern(name, target, seed),
            putts = ridgePuttPattern(
              name,
              RIDGE_TEST_PUTTS[key] ?? 30 + ((seed * 5) % 7),
              points,
              seed,
            ),
            hcp = playerDailyHandicap(id, 1);
          scores[id] = {};
          for (let h = 1; h <= 18; h++) {
            const par = +(v.par?.[h - 1] || 4),
              index = v.index?.[h - 1] ?? "",
              stroke = stablefordStrokeCount(index, hcp),
              gross = Math.max(1, par + stroke + 2 - points[h - 1]);
            scores[id][h] = {
              self: { playerId: id, gross, putts: putts[h - 1] },
              official: { playerId: partner[id] || "", gross: "", putts: "" },
              ntp: {},
            };
          }
          scores[id]._meta = {
            finalisedAt: `2026-08-22T${String(8 + Math.floor(seed / 4)).padStart(2, "0")}:${String((seed % 4) * 7).padStart(2, "0")}:00+10:00`,
          };
        });
        ids.forEach((id) => {
          const marked = partner[id];
          for (let h = 1; h <= 18; h++) {
            scores[id][h].official.gross = scores[marked][h].self.gross;
            scores[id][h].official.putts = scores[marked][h].self.putts;
          }
        });
        const hole = +(e.ntpSelections?.day1?.[0] || 0),
          findId = (name) =>
            ids.find(
              (id) => (player(id)?.name || "").toLowerCase() === name.toLowerCase(),
            );
        if (hole) {
          const changes = [
            ["Example Golfer 01", "Example Golfer 48", "2026-08-22T09:24:00+10:00"],
            ["Example Golfer 27", "Example Golfer 38", "2026-08-22T10:15:00+10:00"],
            ["Example Golfer 40", "Example Golfer 26", "2026-08-22T11:02:00+10:00"],
          ];
          changes.forEach(([entrant, scorer, at], i) => {
            const entrantId =
                findId(entrant) || ids[Math.min(i * 5, ids.length - 1)],
              scorerId = findId(scorer) || ids[Math.min(i * 5 + 1, ids.length - 1)];
            scores[scorerId][hole].ntp = {
              entrantId,
              confirmedAt: at,
              locked: true,
            };
          });
        }
        return scores;
      }
      function loadRidgeEventTest() {
        if (!ridgeTestEligible())
          return alert(
            "The Ridge test requires a locked one-day event with exactly 16 players.",
          );
        if (
          !confirm(
            "Play and finalise all 16 Ridge test rounds now?\n\nYour complete locked event will be backed up. Test scores will remain local and can be removed afterwards.",
          )
        )
          return;
        if (!localStorage.getItem("awayGolfRidgeTestBackupV1"))
          localStorage.setItem(
            "awayGolfRidgeTestBackupV1",
            JSON.stringify({
              event: store.event,
              cloud: store.cloud || null,
              cloudPlayers: store.cloudPlayers || [],
            }),
          );
        closeCloudConnection();
        delete store.cloud;
        const e = store.event,
          ids = dayFieldIds(1)
            .filter((id) => String(id) !== NO_PARTNER_ID)
            .map(String),
          scores = makeRidgeTestScoring();
        e.scoring = { ...(e.scoring || {}), day1: scores };
        e.roundFinalised = { ...(e.roundFinalised || {}), day1: {} };
        ids.forEach(
          (id) => (e.roundFinalised.day1[id] = scores[id]._meta.finalisedAt),
        );
        e.prizesAwarded = {};
        e.ridgeTestMode = true;
        e.liveControlDay = 1;
        e.leaderboardView = "summary";
        store.cloudPlayers = ids.map((id, i) => ({
          playerId: id,
          name: player(id)?.name || id,
          joined: true,
          joinedAt: `2026-08-22T${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 6).padStart(2, "0")}:00+10:00`,
        }));
        writeLocalStore();
        $("#modalShade").classList.remove("open");
        renderHome();
        renderLeaderboard();
        nav("home");
      }
      function restoreRidgeEventAfterTest() {
        let backup;
        try {
          backup = JSON.parse(
            localStorage.getItem("awayGolfRidgeTestBackupV1") || "null",
          );
        } catch (_) {
          backup = null;
        }
        if (!backup) return alert("No Ridge event backup was found.");
        if (
          !confirm(
            "Remove every test score and restore the locked Ridge event exactly as it was before the test?",
          )
        )
          return;
        closeCloudConnection();
        store.event = backup.event;
        if (
          store.event?.days === 1 &&
          Array.isArray(store.event.competitions) &&
          store.event.competitions.includes("combined")
        ) {
          store.event.competitions = store.event.competitions.filter(
            (id) => id !== "combined",
          );
          if (!store.event.competitions.includes("single"))
            store.event.competitions.push("single");
        }
        store.cloud = backup.cloud || undefined;
        store.cloudPlayers = backup.cloudPlayers || [];
        localStorage.removeItem("awayGolfRidgeTestBackupV1");
        writeLocalStore();
        $("#modalShade").classList.remove("open");
        renderHome();
        renderLeaderboard();
        renderPlayerExperience();
        if (store.cloud?.eventId) {
          watchCloudEvent();
          syncCloudNow();
        }
        nav("home");
      }
      function openTestEventTools() {
        const ridgeActive = Boolean(store.event?.ridgeTestMode),
          ridgeReady = ridgeTestEligible(),
          ridgeBackup = Boolean(localStorage.getItem("awayGolfRidgeTestBackupV1")),
          active = Boolean(store.event?.testMode),
          oneDay = active && store.event.days === 1,
          sixteen = store.event?.testKind === "sixteen",
          backup = Boolean(localStorage.getItem("awayGolfTestBackupV1"));
        if (ridgeActive || ridgeReady || ridgeBackup) {
          $("#modalContent").innerHTML =
            `<h2>The Ridge — 16-Player Test</h2><p>Complete all 288 holes locally using the locked players, groups, handicaps and competitions. The original locked event is backed up before any scores are added.</p>${ridgeActive ? '<div class="testStageButtons"><button class="primary" id="openRidgeResults">Open Results Summary</button><button class="danger" id="restoreRidgeEvent">Remove Test Scores & Restore Event</button></div>' : '<div class="testStageButtons"><button class="primary" id="loadRidgeTest">Play All 16 Rounds</button></div>'}<button class="soft closeTestTools" id="closeTestTools">Close</button>`;
          $("#modalShade").classList.add("open");
          if ($("#loadRidgeTest")) $("#loadRidgeTest").onclick = loadRidgeEventTest;
          if ($("#restoreRidgeEvent"))
            $("#restoreRidgeEvent").onclick = restoreRidgeEventAfterTest;
          if ($("#openRidgeResults"))
            $("#openRidgeResults").onclick = () => {
              $("#modalShade").classList.remove("open");
              store.event.leaderboardView = "summary";
              nav("leaderboardPage");
            };
          $("#closeTestTools").onclick = () =>
            $("#modalShade").classList.remove("open");
          return;
        }
        $("#modalContent").innerHTML =
          `<h2>Oatlands Test Events</h2><p>Test complete events safely with genuine Oatlands scoring patterns. Test data remains local and cannot be published.</p>${active ? `<h3>${sixteen ? "One-Day 16-Player Dress Rehearsal" : `${oneDay ? "One-Day" : "Two-Day"} Eight-Player Test`}</h3><div class="testStageButtons"><button class="soft" id="testClearScores">Start with No Scores</button><button class="primary" id="testDay1Scores">${oneDay ? "Complete Round" : "Complete Day 1"}</button>${oneDay ? "" : `<button class="primary" id="testBothDays">Complete Both Days</button>`}</div><div class="testChoiceButtons"><button class="soft" data-switchtest="oneDay">8 Players · One Day</button><button class="soft" data-switchtest="twoDay">8 Players · Two Days</button><button class="primary" data-switchtest="sixteen">16 Players · One Day</button></div>${backup ? '<button class="danger restoreTestBtn" id="restoreTestEvent">Restore My Previous Event</button>' : ""}` : `<div class="testChoiceButtons"><button class="primary" id="beginOneDayTest">8 Players · One Day</button><button class="primary" id="beginTwoDayTest">8 Players · Two Days</button><button class="primary" id="beginSixteenTest">16 Players · One-Day Dress Rehearsal</button></div>`}<button class="soft closeTestTools" id="closeTestTools">Close</button>`;
        $("#modalShade").classList.add("open");
        if ($("#beginOneDayTest"))
          $("#beginOneDayTest").onclick = () => beginOatlandsTest("oneDay");
        if ($("#beginTwoDayTest"))
          $("#beginTwoDayTest").onclick = () => beginOatlandsTest("twoDay");
        if ($("#beginSixteenTest"))
          $("#beginSixteenTest").onclick = () => beginOatlandsTest("sixteen");
        $$("[data-switchtest]").forEach(
          (b) => (b.onclick = () => switchOatlandsTest(b.dataset.switchtest)),
        );
        if ($("#testClearScores"))
          $("#testClearScores").onclick = () => loadTestStage(0);
        if ($("#testDay1Scores"))
          $("#testDay1Scores").onclick = () => loadTestStage(1);
        if ($("#testBothDays")) $("#testBothDays").onclick = () => loadTestStage(2);
        if ($("#restoreTestEvent"))
          $("#restoreTestEvent").onclick = restoreBeforeTest;
        $("#closeTestTools").onclick = () =>
          $("#modalShade").classList.remove("open");
      }
      return { open: openTestEventTools };
    },
  };
})();
