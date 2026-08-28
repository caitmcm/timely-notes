using FastEndpoints;
using FastEndpoints.Swagger;
using TimelyNotes.API.Repositories;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddFastEndpoints()
    .SwaggerDocument();

// Singleton so the in-memory seed survives across requests.
builder.Services.AddSingleton<INoteRepository, InMemoryNoteRepository>();

var app = builder.Build();

app.UseHttpsRedirection();

app.UseFastEndpoints();

if (app.Environment.IsDevelopment())
{
    app.UseSwaggerGen();
}

app.Run();

// Exposed for in-process tests.
public partial class Program;
