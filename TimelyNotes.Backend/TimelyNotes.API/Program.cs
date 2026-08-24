using FastEndpoints;
using FastEndpoints.Swagger;
using TimelyNotes.API.Repositories;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddFastEndpoints()
    .SwaggerDocument();

// Singleton: the in-memory store's seeded state has to survive across requests.
builder.Services.AddSingleton<INoteRepository, InMemoryNoteRepository>();

var app = builder.Build();

app.UseHttpsRedirection();

app.UseFastEndpoints();

if (app.Environment.IsDevelopment())
{
    app.UseSwaggerGen();
}

app.Run();

// Exposed so the test project can spin the API up in-process.
public partial class Program;
