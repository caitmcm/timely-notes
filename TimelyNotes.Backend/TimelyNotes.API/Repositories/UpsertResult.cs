using TimelyNotes.API.Models;

namespace TimelyNotes.API.Repositories;

/// <summary>
/// What an upsert did, so the endpoint can answer <c>201</c> or <c>200</c> without a second query.
/// </summary>
public readonly record struct UpsertResult(Note Note, bool Created);
