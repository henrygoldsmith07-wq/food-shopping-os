import { useState } from 'react';
import { Check, FolderPlus, Pencil, Trash2, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import {
  ALL_RECIPES, FOLDER_LIMIT, FOLDER_NAME_MAX, folderNameAvailable, folderTabs,
} from '../lib/recipe-folders.js';
import { Card, Chip } from './ui.jsx';

const field = {
  background: 'var(--card-2)',
  borderColor: 'var(--line)',
  color: 'var(--ink)',
};

/**
 * The folder bar and its editing controls.
 *
 * "All recipes" is always first and is not a folder — selecting it clears the
 * filter rather than opening anything. "Unfiled" only appears once there is
 * something unfiled to show, so an empty library is not littered with a tab
 * that leads nowhere.
 */
export default function RecipeFolders({ recipes = [], selected = ALL_RECIPES, onSelect }) {
  const app = useApp();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const folders = app.recipeFolders;
  const tabs = folderTabs(recipes, folders);
  const current = folders.find((folder) => folder.id === selected) || null;
  const canCreate = folderNameAvailable(folders, name) && folders.length < FOLDER_LIMIT;
  const canRename = editing ? folderNameAvailable(folders, draft, editing) : false;

  const startEditing = (folder) => {
    setEditing(folder.id);
    setDraft(folder.name);
  };

  return (
    <Card className="space-y-2.5">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <Chip key={tab.id || 'all'} active={selected === tab.id} onClick={() => onSelect(tab.id)}>
            {tab.name} ({tab.count})
          </Chip>
        ))}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Rename folder"
            maxLength={FOLDER_NAME_MAX}
            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
            style={field}
          />
          <button
            onClick={() => { app.renameRecipeFolder(editing, draft); setEditing(null); }}
            disabled={!canRename}
            aria-label="Save folder name"
            className="press rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <Check size={14} strokeWidth={3} />
          </button>
          <button
            onClick={() => setEditing(null)}
            aria-label="Cancel rename"
            className="press rounded-xl border px-3 py-2"
            style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="New folder name"
            placeholder="e.g. Weeknights"
            maxLength={FOLDER_NAME_MAX}
            className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
            style={field}
          />
          <button
            onClick={() => { app.createRecipeFolder(name); setName(''); }}
            disabled={!canCreate}
            className="press rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <span className="inline-flex items-center gap-1.5"><FolderPlus size={14} /> New folder</span>
          </button>
        </div>
      )}

      {name.trim().length > 0 && !canCreate && !editing && (
        <p className="text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
          {folders.length >= FOLDER_LIMIT
            ? `${FOLDER_LIMIT} folders is as many as the bar can usefully show.`
            : 'You already have a folder with that name.'}
        </p>
      )}

      {current && !editing && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <p className="min-w-0 truncate text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
            {current.recipeIds.length === 0
              ? 'Empty — open a recipe and file it here.'
              : `${current.recipeIds.length} recipe${current.recipeIds.length === 1 ? '' : 's'} filed here.`}
          </p>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => startEditing(current)}
              aria-label={`Rename ${current.name}`}
              className="press p-1.5"
              style={{ color: 'var(--faint)' }}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => { app.removeRecipeFolder(current.id); onSelect(ALL_RECIPES); }}
              aria-label={`Delete ${current.name}`}
              className="press p-1.5"
              style={{ color: 'var(--faint)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {current && (
        <p className="text-[0.6875rem] font-semibold" style={{ color: 'var(--faint)' }}>
          Deleting a folder leaves its recipes in your library, unfiled.
        </p>
      )}
    </Card>
  );
}

/**
 * Filing one recipe. Picking the folder it is already in takes it out again,
 * so the same tap both files and unfiles — there is no separate "remove".
 */
export function RecipeFolderPicker({ recipeId }) {
  const app = useApp();
  const [name, setName] = useState('');
  const folders = app.recipeFolders;
  const home = folders.find((folder) => folder.recipeIds.includes(recipeId)) || null;

  return (
    <div>
      <p className="text-[0.75rem] font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>Folder</p>
      <p className="mt-1 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
        {home ? `Filed in ${home.name}.` : 'Not filed yet. A recipe lives in one folder at a time.'}
      </p>
      {folders.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {folders.map((folder) => (
            <Chip
              key={folder.id}
              active={home?.id === folder.id}
              onClick={() => app.moveRecipeToFolder(recipeId, home?.id === folder.id ? null : folder.id)}
            >
              {folder.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="New folder name"
          placeholder="Weeknights"
          maxLength={FOLDER_NAME_MAX}
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold outline-none"
          style={field}
        />
        <button
          onClick={() => { app.createRecipeFolder(name, recipeId); setName(''); }}
          disabled={!folderNameAvailable(folders, name) || folders.length >= FOLDER_LIMIT}
          className="press shrink-0 rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span className="inline-flex items-center gap-1.5"><FolderPlus size={14} /> File it here</span>
        </button>
      </div>
    </div>
  );
}
