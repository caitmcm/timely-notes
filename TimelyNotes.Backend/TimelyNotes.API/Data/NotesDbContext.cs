using Microsoft.EntityFrameworkCore;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Data;

/// <summary>
/// One table. Schedules are code, not rows, so the domain has one entity and no relationships.
/// </summary>
public class NotesDbContext(DbContextOptions<NotesDbContext> options) : DbContext(options)
{
    public DbSet<Note> Notes => Set<Note>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        var note = model.Entity<Note>();

        // The address is the key: uniqueness per period is the database's to enforce, not a
        // SingleOrDefault's.
        note.HasKey(n => new { n.ScheduleSpanHours, n.Day, n.PeriodOrdinal });

        note.Property(n => n.ScheduleSpanHours).HasColumnType("integer");
        note.Property(n => n.Day).HasColumnType("date");
        note.Property(n => n.PeriodOrdinal).HasColumnType("integer");

        // Empty string is the normalised empty note, not null. See NoteContent.
        note.Property(n => n.Content).HasColumnType("text").IsRequired();

        note.Property(n => n.CreatedAt).HasColumnType("timestamp with time zone");
        note.Property(n => n.ModifiedAt).HasColumnType("timestamp with time zone");
    }
}
