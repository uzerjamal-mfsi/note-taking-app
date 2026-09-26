# Spec Delta

## Purpose

Gives each user their own private set of named tags that can be associated with their notes, so notes can be filtered by tag in the notes list. This capability covers only tag identity and the note-tag association; it does not include any endpoint for creating, renaming, or assigning tags.

## ADDED Requirements

### Requirement: Per-user tag identity
The system SHALL scope tags per user: a tag's name SHALL be unique for its owning user, compared case-insensitively, but the same name MAY be used independently by different users. A tag SHALL NOT be visible to, or usable by, any user other than its owner.

#### Scenario: Duplicate tag name for the same user is rejected
- **WHEN** a second tag is created for a user with a name that differs only in case from a tag that user already has (e.g. the user already has `work` and a `Work` tag is created for them)
- **THEN** the system rejects the second tag as a duplicate and does not create it

#### Scenario: Same tag name is independent across users
- **WHEN** two different users each have a tag named `work`
- **THEN** both tags exist independently, and neither user's tag is visible to or affected by the other's

### Requirement: Note-tag association
The system SHALL allow a note to be associated with zero or more of its owner's tags. A note SHALL only ever be associated with tags owned by the same user who owns the note. This association exists so a note can be matched by the notes list's tag filter (see the `notes` capability); this change does not add any endpoint to create, view, or change a note's tag associations directly.

#### Scenario: A note may have multiple tags
- **WHEN** a note is associated with more than one tag
- **THEN** the note matches a tag filter request naming any one of those tags

#### Scenario: A note may have no tags
- **WHEN** a note has no tag associations
- **THEN** the note is excluded from any request that filters by tag, and included in a request that does not filter by tag
