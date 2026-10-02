using Microsoft.EntityFrameworkCore;
using TimelyNotes.API.Models;

namespace TimelyNotes.API.Data;

/// <summary>
/// Users and their notes. Schedules are code, not rows.
/// </summary>
public class NotesDbContext(DbContextOptions<NotesDbContext> options) : DbContext(options)
{
    public DbSet<Note> Notes => Set<Note>();

    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        var user = model.Entity<User>();

        user.HasKey(u => u.Id);
        user.Property(u => u.Id).HasColumnType("uuid").ValueGeneratedNever();
        user.HasAlternateKey(u => new { u.Issuer, u.Subject });
        user.Property(u => u.Issuer).HasColumnType("text");
        user.Property(u => u.Subject).HasColumnType("text");
        user.Property(u => u.CreatedAt).HasColumnType("timestamp with time zone");

        var note = model.Entity<Note>();

        // The address is the key: uniqueness per period is the database's to enforce, not a
        // SingleOrDefault's.
        note.HasKey(n => new { n.UserId, n.ScheduleSpanHours, n.Day, n.PeriodOrdinal });

        note.Property(n => n.UserId).HasColumnType("uuid");

        // Restrict, not EF's cascade default: account deletion will choose deliberately.
        note.HasOne<User>()
            .WithMany()
            .HasForeignKey(n => n.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        note.Property(n => n.ScheduleSpanHours).HasColumnType("integer");
        note.Property(n => n.Day).HasColumnType("date");
        note.Property(n => n.PeriodOrdinal).HasColumnType("integer");

        // Empty string is the normalised empty note, not null. See NoteContent.
        note.Property(n => n.Content).HasColumnType("text").IsRequired();

        note.Property(n => n.CreatedAt).HasColumnType("timestamp with time zone");
        note.Property(n => n.ModifiedAt).HasColumnType("timestamp with time zone");
    }
}
