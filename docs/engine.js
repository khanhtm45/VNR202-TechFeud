/* VNR202 - Game engine for the GitHub Pages edition.
   Pure rules, without any DOM dependency. */
(function (root) {
  'use strict';

  const STAGES = ['rapid', 'feud', 'green'];
  const STAGE_LABELS = {
    lobby: 'Sẵn sàng',
    rapid: 'Dấu mốc lịch sử',
    feud: 'Giải mã Đại hội',
    green: 'Việt Nam xanh',
    finale: 'Chung cuộc'
  };
  const TEAM_COUNT = 8;

  function createInitialState(names) {
    return {
      version: 2,
      teams: Array.from({ length: TEAM_COUNT }, (_, i) => ({
        id: i + 1,
        name: String(names?.[i] || 'Đội ' + (i + 1)).slice(0, 32),
        score: 0
      })),
      stage: 'lobby',
      index: 0,
      selectedTeamId: 1,
      revealed: false,
      slots: [],
      strikes: 0,
      roundPoints: 0,
      awards: {},
      remainingMs: 0,
      deadline: 0,
      running: false
    };
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function question(bank, state) {
    return bank?.rounds?.[state.stage]?.[state.index] || null;
  }
  function durationMs(q) { return (Number(q?.duration) || 30) * 1000; }
  function remainingMs(state, now = Date.now()) {
    return state.running ? Math.max(0, state.deadline - now) : Math.max(0, state.remainingMs || 0);
  }
  function ensureTeam(state, id) {
    const team = state.teams.find(t => t.id === Number(id));
    if (!team) throw new Error('Hãy chọn một trong tám đội.');
    return team;
  }
  function choose(state, bank, stage, index) {
    index = Number(index);
    if (!STAGES.includes(stage) || !Number.isInteger(index) || !bank?.rounds?.[stage]?.[index]) {
      throw new Error('Vòng thi hoặc câu hỏi không hợp lệ.');
    }
    const q = bank.rounds[stage][index];
    Object.assign(state, {
      stage, index, revealed: false, slots: [], strikes: 0, roundPoints: 0,
      deadline: 0, remainingMs: durationMs(q), running: false
    });
  }
  function rankTeams(teams) {
    return teams.slice().sort((a, b) => b.score - a.score || a.id - b.id);
  }

  function reduce(oldState, action, bank, now = Date.now()) {
    const s = clone(oldState), type = action?.type, q = question(bank, s);
    switch (type) {
      case 'START':
        choose(s, bank, 'rapid', 0);
        break;
      case 'RESET': {
        return createInitialState(s.teams.map(t => t.name));
      }
      case 'SELECT': {
        choose(s, bank, action.stage, action.index);
        break;
      }
      case 'NEXT': {
        if (!q) throw new Error('Hãy bắt đầu một câu hỏi trước.');
        if (bank.rounds[s.stage][s.index + 1]) {
          choose(s, bank, s.stage, s.index + 1);
        } else {
          const next = STAGES[STAGES.indexOf(s.stage) + 1];
          if (next) choose(s, bank, next, 0);
          else Object.assign(s, { stage: 'finale', deadline: 0, remainingMs: 0, running: false });
        }
        break;
      }
      case 'FINISH':
        Object.assign(s, { stage: 'finale', running: false, deadline: 0, remainingMs: 0 });
        break;
      case 'REVEAL':
        if (!q) throw new Error('Chưa có câu hỏi.');
        if (s.stage === 'feud') {
          const i = Number(action.index);
          if (!Number.isInteger(i) || i < 0 || i >= q.answers.length || s.slots.includes(i)) {
            throw new Error('Ô đã mở hoặc không hợp lệ.');
          }
          s.slots.push(i);
          s.roundPoints += Number(q.answers[i].points) || 0;
        } else {
          s.revealed = true;
        }
        break;
      case 'STRIKE':
        if (s.stage !== 'feud') throw new Error('Dấu sai chỉ áp dụng cho vòng 2.');
        s.strikes = Math.min(3, s.strikes + 1);
        break;
      case 'CLEAR_STRIKES':
        s.strikes = 0;
        break;
      case 'AWARD': {
        if (!q) throw new Error('Chưa có câu hỏi.');
        const team = ensureTeam(s, action.teamId);
        if (s.awards[q.id]) throw new Error('Câu này đã được chấm điểm.');
        if (s.stage !== 'feud' && !s.revealed) throw new Error('Hãy mở đáp án trước.');
        const points = s.stage === 'feud' ? s.roundPoints : Number(q.points) || 0;
        if (points <= 0) throw new Error('Chưa có điểm để trao.');
        team.score += points;
        s.awards[q.id] = { teamId: team.id, points };
        break;
      }
      case 'ADJUST': {
        const team = ensureTeam(s, action.teamId), delta = Number(action.delta);
        if (!Number.isInteger(delta) || Math.abs(delta) > 1000) {
          throw new Error('Điểm điều chỉnh không hợp lệ.');
        }
        team.score = Math.max(0, team.score + delta);
        break;
      }
      case 'RENAME': {
        const team = ensureTeam(s, action.teamId);
        const name = String(action.name || '').trim();
        if (!name || name.length > 32) throw new Error('Tên đội phải có 1–32 ký tự.');
        team.name = name;
        break;
      }
      case 'SELECT_TEAM':
        ensureTeam(s, action.teamId);
        s.selectedTeamId = Number(action.teamId);
        break;
      case 'TIMER_START':
        if (!q) throw new Error('Hãy chọn câu hỏi trước khi bắt đầu giờ.');
        if (!s.running && s.remainingMs > 0) {
          s.deadline = now + s.remainingMs;
          s.running = true;
        }
        break;
      case 'TIMER_PAUSE':
        s.remainingMs = remainingMs(s, now);
        s.running = false;
        s.deadline = 0;
        break;
      case 'TIMER_RESET':
        if (!q) throw new Error('Hãy chọn câu hỏi trước.');
        s.remainingMs = durationMs(q);
        s.running = false;
        s.deadline = 0;
        break;
      default:
        throw new Error('Thao tác không được hỗ trợ.');
    }
    return s;
  }

  function restore(raw, legacy) {
    let base = createInitialState();
    if ((!raw || raw.version !== 2) && legacy && legacy.teamA && legacy.teamB) {
      raw = {
        version: 2, ...base,
        teams: base.teams.map((t, i) => {
          const old = i === 0 ? legacy.teamA : i === 1 ? legacy.teamB : null;
          return old ? { ...t, name: String(old.name || t.name), score: Math.max(0, Number(old.score) || 0) } : t;
        }),
        stage: legacy.stage || 'lobby',
        index: legacy.index || 0,
        revealed: Boolean(legacy.revealed),
        slots: legacy.slots || [],
        strikes: legacy.strikes || 0,
        roundPoints: legacy.roundPoints || 0,
        awards: legacy.awards || {},
        running: false,
        remainingMs: legacy.remainingMs || 0
      };
    }
    if (!raw || raw.version !== 2) return base;
    const s = { ...base, ...raw };
    s.teams = base.teams.map((t, i) => {
      const v = Array.isArray(raw.teams) ? raw.teams.find(t => t?.id === i + 1) : null;
      return {
        id: i + 1,
        name: String(v?.name || t.name).slice(0, 32),
        score: Math.max(0, Number(v?.score) || 0)
      };
    });
    s.awards = raw.awards && typeof raw.awards === 'object' ? raw.awards : {};
    s.slots = Array.isArray(raw.slots) ? raw.slots.filter(Number.isInteger) : [];
    s.selectedTeamId = s.teams.some(t => t.id === Number(raw.selectedTeamId)) ? Number(raw.selectedTeamId) : 1;
    // Preserve a running timer across tabs or refreshes. Its deadline is absolute.
    // When the saved deadline has passed, show zero instead of restarting the clock.
    if (s.running) {
      s.remainingMs = remainingMs(s);
      if (s.remainingMs === 0) { s.running = false; s.deadline = 0; }
    } else {
      s.remainingMs = Math.max(0, Number(s.remainingMs) || 0);
      s.deadline = 0;
    }
    if (!['lobby', 'finale', ...STAGES].includes(s.stage)) s.stage = 'lobby';
    return s;
  }

  const engine = { STAGES, STAGE_LABELS, TEAM_COUNT, createInitialState, question, remainingMs, rankTeams, reduce, restore };
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  if (root) root.VNR202Engine = engine;
})(typeof window !== 'undefined' ? window : null);
