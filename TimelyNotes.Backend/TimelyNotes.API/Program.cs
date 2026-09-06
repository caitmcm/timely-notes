using FastEndpoints;
using FastEndpoints.Swagger;
using TimelyNotes.API.Repositories;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddFastEndpoints()
    .SwaggerDocument();

// Singleton so the in-memory seed survives across requests.
builder.Services.AddSingleton<INoteRepository, InMemoryNoteRepository>();

// The UI is served from its own origin, so CORS is configuration: `Cors:AllowedOrigins` is empty
// in dev, where the Vite proxy makes every call same-origin.
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.UseCors();

app.UseFastEndpoints();

if (app.Environment.IsDevelopment())
{
    app.UseSwaggerGen();
}

app.Run();

// Exposed for in-process tests.
public partial class Program;
