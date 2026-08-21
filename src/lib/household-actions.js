import { permissionsForRole } from './household.js';

const event = (state, uid, message, kind = 'household') => ({
  householdEvents: [...state.householdEvents, {
    id: uid('he'), at: Date.now(), date: state.day, kind, message,
  }].slice(-50),
});

const toggleList = (member, field, value) => {
  const list = Array.isArray(member[field]) ? member[field] : [];
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return member;
  return {
    ...member,
    [field]: list.includes(clean)
      ? list.filter((item) => item !== clean)
      : [...list, clean],
  };
};

export const householdActions = (set, uid) => ({
  setHouseholdName: (householdName) => set({ householdName: String(householdName || '').trim().slice(0, 60) }),
  setActiveMember: (activeMemberId) =>
    set((state) => ({ activeMemberId: state.members.some((member) => member.id === activeMemberId) ? activeMemberId : null })),
  addMember: (member) =>
    set((state) => {
      const role = member.role === 'child' ? 'child' : 'adult';
      const created = {
        id: uid('m'),
        name: member.name?.trim() || `Person ${state.members.length + 1}`,
        portions: Math.max(0.5, Number(member.portions) || 1),
        diets: member.diets || [],
        role,
        permissions: { ...permissionsForRole(role), ...(member.permissions || {}) },
        notifications: member.notifications !== false,
      };
      return { members: [...state.members, created], ...event(state, uid, `${created.name} joined the household.`) };
    }),
  updateMember: (id, patch) =>
    set((state) => ({ members: state.members.map((member) => (member.id === id ? { ...member, ...patch } : member)) })),
  removeMember: (id) =>
    set((state) => {
      const member = state.members.find((item) => item.id === id);
      return {
        members: state.members.filter((item) => item.id !== id),
        activeMemberId: state.activeMemberId === id ? null : state.activeMemberId,
        shoppingList: state.shoppingList.map((item) => (item.assigneeId === id ? { ...item, assigneeId: null } : item)),
        chores: state.chores.map((chore) => (chore.assigneeId === id ? { ...chore, assigneeId: null } : chore)),
        ...(member ? event(state, uid, `${member.name} was removed from the household.`) : {}),
      };
    }),
  toggleMemberDiet: (id, diet) =>
    set((state) => ({
      members: state.members.map((member) => (member.id === id
        ? { ...member, diets: member.diets.includes(diet) ? member.diets.filter((item) => item !== diet) : [...member.diets, diet] }
        : member)),
    })),
  toggleMemberAllergy: (id, value) => set((state) => ({ members: state.members.map((member) => (
    member.id === id
      ? toggleList(member, 'allergies', value)
      : member
  )) })),
  toggleMemberIntolerance: (id, value) => set((state) => ({ members: state.members.map((member) => (
    member.id === id
      ? toggleList(member, 'intolerances', value)
      : member
  )) })),
  toggleMemberDislike: (id, value) => set((state) => ({ members: state.members.map((member) => (
    member.id === id
      ? toggleList(member, 'dislikes', value)
      : member
  )) })),
  toggleMemberPermission: (id, permission) =>
    set((state) => ({
      members: state.members.map((member) => (member.id === id
        ? {
          ...member,
          permissions: {
            ...permissionsForRole(member.role),
            ...(member.permissions || {}),
            [permission]: !(member.permissions?.[permission] ?? permissionsForRole(member.role)[permission]),
          },
        }
        : member)),
    })),
  assignListItem: (id, assigneeId) =>
    set((state) => {
      const item = state.shoppingList.find((row) => row.id === id);
      const member = state.members.find((row) => row.id === assigneeId);
      if (!item) return {};
      return {
        shoppingList: state.shoppingList.map((row) => (row.id === id ? { ...row, assigneeId: assigneeId || null } : row)),
        ...event(state, uid, member ? `${item.name} assigned to ${member.name}.` : `${item.name} is unassigned.`, 'shopping'),
      };
    }),
  addChore: ({ title, assigneeId = null, due = null }) =>
    set((state) => {
      const clean = String(title || '').trim().slice(0, 100);
      if (!clean) return {};
      return {
        chores: [...state.chores, { id: uid('c'), title: clean, assigneeId: assigneeId || null, due: due || null, done: false }],
        ...event(state, uid, `Task added: ${clean}.`, 'task'),
      };
    }),
  toggleChore: (id) =>
    set((state) => {
      const chore = state.chores.find((item) => item.id === id);
      if (!chore) return {};
      return {
        chores: state.chores.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
        ...event(state, uid, `${chore.title} marked ${chore.done ? 'open' : 'done'}.`, 'task'),
      };
    }),
  removeChore: (id) => set((state) => ({ chores: state.chores.filter((chore) => chore.id !== id) })),
  importHousehold: (snapshot) =>
    set((state) => ({
      householdName: snapshot.householdName || state.householdName,
      members: snapshot.members,
      pantry: snapshot.pantry,
      shoppingList: snapshot.shoppingList,
      myRecipes: snapshot.myRecipes,
      chores: snapshot.chores,
      activeMemberId: null,
      ...event(state, uid, 'Household snapshot imported.', 'sync'),
    })),
  clearHouseholdEvents: () => set({ householdEvents: [] }),
});
