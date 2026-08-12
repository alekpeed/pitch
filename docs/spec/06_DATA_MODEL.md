# Data Model

The exact database can vary. SQLite is sufficient for a local-first implementation.

## Core entities

### UserProfile
- id
- created_at
- notation_preference
- preferred_instruments
- default_session_minutes
- training_priority_weights
- settings_json

### Skill
- id
- parent_id
- name
- domain
- description
- prerequisite_ids
- enabled

### ExerciseTemplate
- id
- name
- skill_ids
- response_type
- generator_type
- difficulty_dimensions
- grading_policy
- hint_policy
- transfer_category

### Session
- id
- started_at
- ended_at
- mode
- planned_focus_json
- user_note
- perceived_difficulty

### Attempt
- id
- session_id
- exercise_template_id
- timestamp
- skill_ids
- stimulus_json
- expected_json
- response_json
- correctness
- partial_credit
- latency_ms
- replay_count
- hints_used
- confidence
- difficulty_json
- context_json
- error_class
- source_asset_id

### SkillState
- skill_id
- updated_at
- mastery_label
- rolling_accuracy
- median_latency_ms
- difficulty_envelope_json
- retention_state_json
- generalization_state_json
- transfer_state_json
- evidence_count
- last_practiced_at
- last_benchmarked_at

### ConfusionPair
- skill_id
- expected_label
- answered_label
- weighted_count
- recent_rate
- trend
- last_seen_at

### RetentionProbe
- id
- skill_id
- due_at
- interval_days
- source_attempt_group
- completed_at
- result_json

### JournalEntry
- id
- session_id
- created_at
- generated_summary
- improvement_json
- weakness_json
- transfer_json
- next_target_json
- user_note

### CapabilityMilestone
- id
- skill_id
- achieved_at
- statement
- evidence_query_json
- evidence_snapshot_json

### AudioAsset
- id
- local_uri
- source_type
- title
- artist
- duration_ms
- bpm
- key_center
- metadata_json

### AudioRegion
- id
- asset_id
- start_ms
- end_ms
- label
- reference_analysis_json

### TranscriptionSubmission
- id
- region_id
- session_id
- submitted_at
- boundaries_json
- harmony_json
- melody_json
- bass_json
- grading_json

### MidiPerformance
- id
- attempt_id
- note_events_json
- expected_notes_json
- timing_grade
- pitch_grade
- voicing_grade

## Event sourcing recommendation
Keep immutable `Attempt` records. Recompute or incrementally update `SkillState` from attempts. Do not store only aggregate percentages because future analytics logic will change.

## Difficulty JSON example
```json
{
  "root_pool": "all_12",
  "register": "random",
  "inversions": "all",
  "voicing": "close_or_open",
  "timbre": ["piano", "rhodes"],
  "context_density": 1,
  "memory_delay_ms": 0,
  "response_deadline_ms": 5000
}
```

## Evidence integrity
Every aggregate shown in Progress should be traceable to underlying attempts and filters. "Then vs Now" must compare compatible conditions or clearly state when difficulty changed.
