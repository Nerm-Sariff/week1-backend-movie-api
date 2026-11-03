const express = require('express');

const app = express();

app.use(express.json());

let movies = [
  {
    id: 1,
    title: "Inception",
    director: "Christopher Nolan",
    year: 2010
  },
  {
    id: 2,
    title: "The Matrix",
    director: "The Wachowskis",
    year: 1999
  },
  {
    id: 3,
    title: "Parasite",
    director: "Bong Joon-ho",
    year: 2019
  },
];

app.get('/movies', (req, res) => {
    res.status(200).json(movies);
});

app.get('/movies/:id', (req, res) => {
    const movie = movies.find(m => m.id === parseInt(req.params.id));
    if (!movie) {
        return res.status(404).json({ message: 'Movie not found' });
    }
    res.status(200).json(movie);
});

app.post('/movies', (req, res) => {
    const { title, director, year } = req.body;
    if (!title || !director || !year) {
        return res.status(400).json({ message: 'Title, director, and year are required' });
    }
    const newMovie = {
        id: movies.length + 1,
        title,
        director,
        year
    };
    movies.push(newMovie);
    res.status(201).json(newMovie);
});

app.patch('/movies/:id', (req, res) => {
    const movie = movies.find(m => m.id === parseInt(req.params.id));
    if (!movie) {
        return res.status(404).json({ message: 'Movie not found' });
    }
    const { title, director, year } = req.body;
    if (title) movie.title = title;
    if (director) movie.director = director;
    if (year) movie.year = year;
    res.status(200).json(movie);
});

app.delete('/movies/:id', (req, res) => {
    const movieIndex = movies.findIndex(m => m.id === parseInt(req.params.id));
    if (movieIndex === -1) {
        return res.status(404).json({ message: 'Movie not found' });
    }
    movies.splice(movieIndex, 1);
    res.status(200).json({ message: 'Movie deleted' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});