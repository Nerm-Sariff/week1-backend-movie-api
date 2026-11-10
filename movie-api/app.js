const express = require('express');
const morgan = require('morgan');

const app = express();

// =====================================
// 1. GENERAL MIDDLEWARE
// =====================================

// Parse incoming JSON request bodies
app.use(express.json());

// Log incoming HTTP requests
app.use(morgan('combined'));

// =====================================
// 2. MOVIE DATA
// =====================================

let movies = [
    {
        id: 1,
        title: 'Inception',
        director: 'Christopher Nolan',
        year: 2010,
        genre: 'Sci-Fi'
    },
    {
        id: 2,
        title: 'The Matrix',
        director: 'The Wachowskis',
        year: 1999,
        genre: 'Action'
    },
    {
        id: 3,
        title: 'Parasite',
        director: 'Bong Joon-ho',
        year: 2019,
        genre: 'Thriller'
    }
];

// =====================================
// 3. HELPER FUNCTIONS
// =====================================

function sendError(res, statusCode, errorCode, message) {
    return res.status(statusCode).json({
        error: {
            code: errorCode,
            message: message
        }
    });
}

function validateMovie(body, partial = false) {
    const errors = [];

    const allowedFields = ['title', 'director', 'year', 'genre'];

    // Check for unknown properties
    for (const key of Object.keys(body)) {
        if (!allowedFields.includes(key)) {
            errors.push(`Unknown property: ${key}`);
        }
    }

    if (!partial || body.title !== undefined) {
        if (typeof body.title !== 'string' || body.title.trim() === '') {
            errors.push('Title is required and must be a non-empty string');
        }
    }

    if (!partial || body.director !== undefined) {
        if (typeof body.director !== 'string' || body.director.trim() === '') {
            errors.push('Director is required and must be a non-empty string');
        }
    }

    if (!partial || body.year !== undefined) {
        const currentYear = new Date().getFullYear();

        if (
            !Number.isInteger(body.year) ||
            body.year < 1888 ||
            body.year > currentYear + 5
        ) {
            errors.push('Year must be a valid movie year');
        }
    }

    if (!partial || body.genre !== undefined) {
        if (typeof body.genre !== 'string' || body.genre.trim() === '') {
            errors.push('Genre is required and must be a non-empty string');
        }
    }

    // PATCH must contain at least one property
    if (partial && Object.keys(body).length === 0) {
        errors.push('At least one property is required');
    }

    return errors;
}

// =====================================
// 4. GET ALL MOVIES
// =====================================

app.get('/movies', (req, res) => {
    let result = [...movies];

    const { genre, minYear, sort, order } = req.query;

    // Filter by genre
    if (genre) {
        result = result.filter(
            movie => movie.genre.toLowerCase() === genre.toLowerCase()
        );
    }

    // Filter by minimum year
    if (minYear !== undefined) {
        const year = Number(minYear);

        if (!Number.isInteger(year)) {
            return sendError(
                res,
                400,
                'INVALID_MIN_YEAR',
                'minYear must be a valid number'
            );
        }

        result = result.filter(movie => movie.year >= year);
    }

    // Validate sorting field
    if (sort !== undefined && !['year', 'title'].includes(sort)) {
        return sendError(
            res,
            400,
            'INVALID_SORT_FIELD',
            'Sort must be either year or title'
        );
    }

    // Validate sorting order
    if (order !== undefined && !['asc', 'desc'].includes(order)) {
        return sendError(
            res,
            400,
            'INVALID_SORT_ORDER',
            'Order must be either asc or desc'
        );
    }

    // Sort movies
    if (sort) {
        const direction = order === 'desc' ? -1 : 1;

        result.sort((a, b) => {
            if (sort === 'title') {
                return a.title.localeCompare(b.title) * direction;
            }

            return (a.year - b.year) * direction;
        });
    }

    res.status(200).json(result);
});

// =====================================
// 5. GET MOVIE BY ID
// =====================================

app.get('/movies/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return sendError(
            res,
            400,
            'INVALID_ID',
            'Movie ID must be a positive integer'
        );
    }

    const movie = movies.find(movie => movie.id === id);

    if (!movie) {
        return sendError(
            res,
            404,
            'MOVIE_NOT_FOUND',
            'Movie not found'
        );
    }

    res.status(200).json(movie);
});

// =====================================
// 6. POST - CREATE A MOVIE
// =====================================

app.post('/movies', (req, res) => {
    const errors = validateMovie(req.body);

    if (errors.length > 0) {
        return sendError(
            res,
            400,
            'VALIDATION_ERROR',
            errors.join(', ')
        );
    }

    const newMovie = {
        id: Math.max(0, ...movies.map(movie => movie.id)) + 1,
        title: req.body.title.trim(),
        director: req.body.director.trim(),
        year: req.body.year,
        genre: req.body.genre.trim()
    };

    movies.push(newMovie);

    res.status(201).json(newMovie);
});

// =====================================
// 7. PUT - REPLACE A MOVIE
// =====================================

app.put('/movies/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return sendError(
            res,
            400,
            'INVALID_ID',
            'Movie ID must be a positive integer'
        );
    }

    const movieIndex = movies.findIndex(movie => movie.id === id);

    if (movieIndex === -1) {
        return sendError(
            res,
            404,
            'MOVIE_NOT_FOUND',
            'Movie not found'
        );
    }

    const errors = validateMovie(req.body);

    if (errors.length > 0) {
        return sendError(
            res,
            400,
            'VALIDATION_ERROR',
            errors.join(', ')
        );
    }

    const updatedMovie = {
        id: id,
        title: req.body.title.trim(),
        director: req.body.director.trim(),
        year: req.body.year,
        genre: req.body.genre.trim()
    };

    movies[movieIndex] = updatedMovie;

    res.status(200).json(updatedMovie);
});

// =====================================
// 8. PATCH - UPDATE PART OF A MOVIE
// =====================================

app.patch('/movies/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return sendError(
            res,
            400,
            'INVALID_ID',
            'Movie ID must be a positive integer'
        );
    }

    const movie = movies.find(movie => movie.id === id);

    if (!movie) {
        return sendError(
            res,
            404,
            'MOVIE_NOT_FOUND',
            'Movie not found'
        );
    }

    const errors = validateMovie(req.body, true);

    if (errors.length > 0) {
        return sendError(
            res,
            400,
            'VALIDATION_ERROR',
            errors.join(', ')
        );
    }

    if (req.body.title !== undefined) {
        movie.title = req.body.title.trim();
    }

    if (req.body.director !== undefined) {
        movie.director = req.body.director.trim();
    }

    if (req.body.year !== undefined) {
        movie.year = req.body.year;
    }

    if (req.body.genre !== undefined) {
        movie.genre = req.body.genre.trim();
    }

    res.status(200).json(movie);
});

// =====================================
// 9. DELETE - REMOVE A MOVIE
// =====================================

app.delete('/movies/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return sendError(
            res,
            400,
            'INVALID_ID',
            'Movie ID must be a positive integer'
        );
    }

    const movieIndex = movies.findIndex(movie => movie.id === id);

    if (movieIndex === -1) {
        return sendError(
            res,
            404,
            'MOVIE_NOT_FOUND',
            'Movie not found'
        );
    }

    movies.splice(movieIndex, 1);

    res.status(200).json({
        message: 'Movie deleted'
    });
});

// =====================================
// 10. TEMPORARY ERROR TEST ROUTE
// Adaded for testing purposes. Remove in production.
// =====================================

app.get('/test-error', (req, res, next) => {
    next(new Error('This is a test server error'));
});

// =====================================
// 11. UNKNOWN ROUTE HANDLER (404)
// =====================================

app.use((req, res) => {
    sendError(
        res,
        404,
        'ROUTE_NOT_FOUND',
        'The requested route does not exist'
    );
});

// =====================================
// 12. ERROR HANDLING MIDDLEWARE
// =====================================

app.use((err, req, res, next) => {
    console.error(err);

    sendError(
        res,
        500,
        'INTERNAL_SERVER_ERROR',
        'An unexpected server error occurred'
    );
});

// =====================================
// 13. START SERVER
// =====================================

const PORT = process.env.PORT || 3000;

console.log('Starting Movie API...');

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});