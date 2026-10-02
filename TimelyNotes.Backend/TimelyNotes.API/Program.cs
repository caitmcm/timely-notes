using FastEndpoints;
using FastEndpoints.Swagger;
using TimelyNotes.API.Auth;
using TimelyNotes.API.Repositories;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddFastEndpoints()
    .SwaggerDocument();

var store = builder.Services.AddNoteStore(builder.Configuration);

builder.Services.AddNoteAuth(builder.Configuration, builder.Environment);

// Handlers never read the clock directly, so a server-set stamp can be asserted rather than approximated.
builder.Services.AddSingleton(TimeProvider.System);

var app = builder.Build();

// Twenty minutes looking for notes in the wrong store is what this line prevents.
app.Logger.LogInformation("Note store: {NoteStore}", store);

app.UseAuthentication();
app.UseAuthorization();

app.UseFastEndpoints();

if (app.Environment.IsDevelopment())
{
    app.UseSwaggerGen();
}

app.Run();

// Exposed for in-process tests.
public partial class Program;
