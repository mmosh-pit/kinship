'use client'

import { useState, useEffect, useRef } from 'react'
import { Spinner, FacetBadge } from '@/components/UI'

// ═══════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════

interface QuickEditModalProps {
  type: 'scene' | 'actor' | 'challenge' | 'quest' | 'route'
  entity: any
  onClose: () => void
  onSave: (id: string, updates: any) => Promise<void>
  scenes?: { id: string; name: string }[]
}

// ═══════════════════════════════════════════════
//  Quick Edit Modal
// ═══════════════════════════════════════════════

export default function QuickEditModal({
  type,
  entity,
  onClose,
  onSave,
  scenes = [],
}: QuickEditModalProps) {
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<any>({})
  const modalRef = useRef<HTMLDivElement>(null)

  // Initialize form data
  useEffect(() => {
    setFormData({ ...entity })
  }, [entity])

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(entity.id, formData)
      onClose()
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }))
  }

  const renderFields = () => {
    switch (type) {
      case 'scene':
        return <SceneFields data={formData} onChange={updateField} />
      case 'actor':
        return (
          <ActorFields data={formData} onChange={updateField} scenes={scenes} />
        )
      case 'challenge':
        return (
          <ChallengeFields
            data={formData}
            onChange={updateField}
            scenes={scenes}
          />
        )
      case 'quest':
        return (
          <QuestFields data={formData} onChange={updateField} scenes={scenes} />
        )
      case 'route':
        return (
          <RouteFields data={formData} onChange={updateField} scenes={scenes} />
        )
      default:
        return null
    }
  }

  const typeLabels = {
    scene: '🏞️ Scene',
    actor: '🎭 Actor',
    challenge: '⚡ Challenge',
    quest: '📖 Quest',
    route: '🔀 Route',
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-sidebar rounded-2xl border border-card-border w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-card-border flex items-center justify-between">
          <div>
            <h3 className="text-white text-sm font-bold">Quick Edit</h3>
            <p className="text-[10px] text-muted mt-0.5">
              {typeLabels[type]} ·{' '}
              <span className="text-accent">{entity.name || 'Untitled'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Form Fields */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {renderFields()}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-card-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-white/70 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Spinner size="sm" /> Saving...
              </>
            ) : (
              '💾 Save'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Field Renderers
// ═══════════════════════════════════════════════

interface FieldProps {
  data: any
  onChange: (field: string, value: any) => void
  scenes?: { id: string; name: string }[]
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="text-xs text-white/70 font-semibold block mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50"
      />
    </div>
  )
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div>
      <label className="text-xs text-white/70 font-semibold block mb-1.5">
        {label}
      </label>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-card border border-card-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="text-xs text-white/70 font-semibold block mb-1.5">
        {label}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-card border border-card-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-accent/50"
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  Scene Fields
// ═══════════════════════════════════════════════

function SceneFields({ data, onChange }: FieldProps) {
  return (
    <>
      <InputField
        label="Scene Name"
        value={data.scene_name || data.name}
        onChange={(v) => onChange('scene_name', v)}
        placeholder="Forest Clearing"
      />
      <InputField
        label="Scene Type"
        value={data.scene_type}
        onChange={(v) => onChange('scene_type', v)}
        placeholder="forest, cave, village..."
      />
      <TextareaField
        label="Description"
        value={data.description}
        onChange={(v) => onChange('description', v)}
        placeholder="A peaceful clearing surrounded by tall trees..."
      />
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="Mood"
          value={data.mood}
          onChange={(v) => onChange('mood', v)}
          placeholder="peaceful, tense..."
        />
        <SelectField
          label="Lighting"
          value={data.lighting}
          onChange={(v) => onChange('lighting', v)}
          options={[
            { value: 'day', label: '☀️ Day' },
            { value: 'night', label: '🌙 Night' },
            { value: 'dusk', label: '🌅 Dusk' },
            { value: 'dawn', label: '🌄 Dawn' },
          ]}
        />
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════
//  Actor Fields
// ═══════════════════════════════════════════════

function ActorFields({ data, onChange, scenes }: FieldProps) {
  const actorTypes = [
    { value: 'character', label: '🧑 Character' },
    { value: 'creature', label: '🦊 Creature' },
    { value: 'collectible', label: '💎 Collectible' },
    { value: 'obstacle', label: '🪨 Obstacle' },
    { value: 'interactive', label: '🔧 Interactive' },
    { value: 'ambient', label: '🦋 Ambient' },
    { value: 'enemy', label: '⚔️ Enemy' },
    { value: 'companion', label: '🐾 Companion' },
  ]

  const facets = [
    { value: 'H', label: 'H - Harmony' },
    { value: 'E', label: 'E - Empowerment' },
    { value: 'A', label: 'A - Awareness' },
    { value: 'R', label: 'R - Resilience' },
    { value: 'T', label: 'T - Tenacity' },
    { value: 'Si', label: 'Si - Self-insight' },
    { value: 'So', label: 'So - Social' },
  ]

  return (
    <>
      <InputField
        label="Name"
        value={data.name}
        onChange={(v) => onChange('name', v)}
        placeholder="Oakley the Owl"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Type"
          value={data.actor_type}
          onChange={(v) => onChange('actor_type', v)}
          options={actorTypes}
        />
        <SelectField
          label="Facet"
          value={data.facet}
          onChange={(v) => onChange('facet', v)}
          options={facets}
        />
      </div>
      <InputField
        label="Role"
        value={data.role}
        onChange={(v) => onChange('role', v)}
        placeholder="guide, merchant, wildlife..."
      />
      <SelectField
        label="Scene"
        value={data.scene_id}
        onChange={(v) => onChange('scene_id', v)}
        options={(scenes || []).map((s) => ({ value: s.id, label: s.name }))}
      />
      {data.actor_type === 'character' && (
        <TextareaField
          label="Greeting"
          value={data.greeting}
          onChange={(v) => onChange('greeting', v)}
          placeholder="Hello, traveler! What brings you here?"
          rows={2}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════
//  Challenge Fields
// ═══════════════════════════════════════════════

function ChallengeFields({ data, onChange, scenes }: FieldProps) {
  const mechanics = [
    { value: 'multiple_choice', label: 'Multiple Choice' },
    { value: 'sorting', label: 'Sorting' },
    { value: 'matching', label: 'Matching' },
    { value: 'fill_blank', label: 'Fill in Blank' },
    { value: 'drag_drop', label: 'Drag & Drop' },
    { value: 'timed', label: 'Timed Challenge' },
  ]

  const difficulties = [
    { value: 'easy', label: '🟢 Easy' },
    { value: 'medium', label: '🟡 Medium' },
    { value: 'hard', label: '🔴 Hard' },
  ]

  return (
    <>
      <InputField
        label="Name"
        value={data.name}
        onChange={(v) => onChange('name', v)}
        placeholder="Forest Knowledge Quiz"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Mechanic"
          value={data.mechanic_type}
          onChange={(v) => onChange('mechanic_type', v)}
          options={mechanics}
        />
        <SelectField
          label="Difficulty"
          value={data.difficulty}
          onChange={(v) => onChange('difficulty', v)}
          options={difficulties}
        />
      </div>
      <TextareaField
        label="Question"
        value={data.question}
        onChange={(v) => onChange('question', v)}
        placeholder="Which animal lives in this tree?"
        rows={2}
      />
      <SelectField
        label="Scene"
        value={data.scene_id}
        onChange={(v) => onChange('scene_id', v)}
        options={(scenes || []).map((s) => ({ value: s.id, label: s.name }))}
      />
    </>
  )
}

// ═══════════════════════════════════════════════
//  Quest Fields
// ═══════════════════════════════════════════════

function QuestFields({ data, onChange, scenes }: FieldProps) {
  const beatTypes = [
    { value: 'introduction', label: 'Introduction' },
    { value: 'exploration', label: 'Exploration' },
    { value: 'challenge', label: 'Challenge' },
    { value: 'collection', label: 'Collection' },
    { value: 'puzzle', label: 'Puzzle' },
    { value: 'social', label: 'Social' },
    { value: 'climax', label: 'Climax' },
    { value: 'resolution', label: 'Resolution' },
  ]

  const facets = [
    { value: 'H', label: 'H - Harmony' },
    { value: 'E', label: 'E - Empowerment' },
    { value: 'A', label: 'A - Awareness' },
    { value: 'R', label: 'R - Resilience' },
    { value: 'T', label: 'T - Tenacity' },
    { value: 'Si', label: 'Si - Self-insight' },
    { value: 'So', label: 'So - Social' },
  ]

  return (
    <>
      <InputField
        label="Name"
        value={data.name}
        onChange={(v) => onChange('name', v)}
        placeholder="Explore the Forest"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Beat Type"
          value={data.beat_type}
          onChange={(v) => onChange('beat_type', v)}
          options={beatTypes}
        />
        <SelectField
          label="Facet"
          value={data.facet}
          onChange={(v) => onChange('facet', v)}
          options={facets}
        />
      </div>
      <TextareaField
        label="Description"
        value={data.description}
        onChange={(v) => onChange('description', v)}
        placeholder="Help the player discover the secrets of the forest..."
        rows={2}
      />
      <SelectField
        label="Scene"
        value={data.scene_id}
        onChange={(v) => onChange('scene_id', v)}
        options={(scenes || []).map((s) => ({ value: s.id, label: s.name }))}
      />
      <InputField
        label="Sequence Order"
        value={String(data.sequence_order || '')}
        onChange={(v) => onChange('sequence_order', parseInt(v) || null)}
        type="number"
        placeholder="1, 2, 3..."
      />
    </>
  )
}

// ═══════════════════════════════════════════════
//  Route Fields
// ═══════════════════════════════════════════════

function RouteFields({ data, onChange, scenes }: FieldProps) {
  return (
    <>
      <InputField
        label="Route Name"
        value={data.name}
        onChange={(v) => onChange('name', v)}
        placeholder="Forest to Village Path"
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="From Scene"
          value={data.from_scene}
          onChange={(v) => onChange('from_scene', v)}
          options={(scenes || []).map((s) => ({ value: s.id, label: s.name }))}
        />
        <SelectField
          label="To Scene"
          value={data.to_scene}
          onChange={(v) => onChange('to_scene', v)}
          options={(scenes || []).map((s) => ({ value: s.id, label: s.name }))}
        />
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 bg-card/40 rounded-xl">
        <div>
          <div className="text-xs text-white/70 font-semibold">
            Bidirectional
          </div>
          <div className="text-[10px] text-muted">
            Players can travel both ways
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={data.bidirectional || false}
            onChange={(e) => onChange('bidirectional', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
        </label>
      </div>
      <TextareaField
        label="Description"
        value={data.description}
        onChange={(v) => onChange('description', v)}
        placeholder="A winding path through the trees..."
        rows={2}
      />
    </>
  )
}
