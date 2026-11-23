
require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const pool = require("./db");

const app = express();

// =====================================
// 1. GENERAL MIDDLEWARE
// =====================================

app.use(express.json());
app.use(morgan("combined"));

// =====================================
// 2. HELPER FUNCTIONS
// =====================================

// Standard error response
function sendError(res, statusCode, errorCode, message) {
    return res.status(statusCode).json({
        error: {
            code: errorCode,
            message: message
        }
    });
}

// Validate movie data
function validateMovie(body, partial = false) {
    const errors = [];

    const allowedFields = ["title", "director", "year"];

    // Check for unknown properties
    for (const key of Object.keys(body)) {
        if (!allowedFields.includes(key)) {
            errors.push(`Unknown property: ${key}`);
        }
    }

    // Validate title
    if (!partial || body.title !== undefined) {
        if (
            typeof body.title !== "string" ||
            body.title.trim() === ""
        ) {
            errors.push(
                "Title is required and must be a non-empty string"
            );
        }
    }

    // Validate director
    if (!partial || body.director !== undefined) {
        if (
            typeof body.director !== "string" ||
            body.director.trim() === ""
        ) {
            errors.push(
                "Director is required and must be a non-empty string"
            );
        }
    }

    // Validate year
    if (!partial || body.year !== undefined) {
        const currentYear = new Date().getFullYear();

        if (
            !Number.isInteger(body.year) ||
            body.year < 1888 ||
            body.year > currentYear + 5
        ) {
            errors.push("Year must be a valid movie year");
        }
    }

    // PATCH must contain at least one property
    if (partial && Object.keys(body).length === 0) {
        errors.push("At least one property is required");
    }

    return errors;
}

// Validate movie ID
function validateId(id) {
    const parsedId = Number(id);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return null;
    }

    return parsedId;
}

// =====================================
// 3. DATABASE HEALTH CHECK
// =====================================

app.get("/health/database", async (req, res, next) => {
    try {
        const result = await pool.query(
            "SELECT NOW() AS database_time"
        );

        res.json({
            status: "ok",
            databaseTime: result.rows[0].database_time
        });

    } catch (error) {
        next(error);
    }
});

// =====================================
// 4. GET ALL MOVIES
// =====================================

app.get("/movies", async (req, res, next) => {
    try {
        const { director, year, sortBy } = req.query;

        let query = `
            SELECT
                id,
                title,
                director,
                release_year AS year
            FROM movies
        `;

        const conditions = [];
        const values = [];

        // Filter by director
        if (director) {
            values.push(`%${director}%`);
            conditions.push(
                `director ILIKE $${values.length}`
            );
        }

        // Filter by year
        if (year) {
            const parsedYear = Number(year);

            if (!Number.isInteger(parsedYear)) {
                return res.status(400).json({
                    message: "Year must be a valid integer"
                });
            }

            values.push(parsedYear);
            conditions.push(
                `release_year = $${values.length}`
            );
        }

        // Add WHERE conditions
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(" AND ")}`;
        }

        // Server-defined sorting allow-list
        const allowedSortColumns = {
            id: "id",
            year: "release_year",
            title: "title"
        };

        const sortColumn =
            allowedSortColumns[sortBy] || "id";

        query += ` ORDER BY ${sortColumn}`;

        const result = await pool.query(query, values);

        res.json(result.rows);

    } catch (error) {
        next(error);
    }
});

// =====================================
// 5. GET MOVIE BY ID
// =====================================

app.get("/movies/:id", async (req, res, next) => {
    try {
        const id = validateId(req.params.id);

        if (id === null) {
            return res.status(400).json({
                message: "Invalid movie ID"
            });
        }

        const result = await pool.query(`
            SELECT
                id,
                title,
                director,
                release_year AS year
            FROM movies
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Movie not found"
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        next(error);
    }
});

// =====================================
// 6. POST - CREATE A MOVIE
// =====================================

app.post("/movies", async (req, res, next) => {
    try {
        const validationErrors = validateMovie(req.body);

        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: validationErrors
            });
        }

        const { title, director, year } = req.body;

        const result = await pool.query(`
            INSERT INTO movies (
                title,
                director,
                release_year
            )
            VALUES ($1, $2, $3)
            RETURNING
                id,
                title,
                director,
                release_year AS year
        `, [title.trim(), director.trim(), year]);

        res.status(201).json(result.rows[0]);

    } catch (error) {
        next(error);
    }
});

// =====================================
// 7. PUT - REPLACE A MOVIE
// =====================================

app.put("/movies/:id", async (req, res, next) => {
    try {
        const id = validateId(req.params.id);

        if (id === null) {
            return res.status(400).json({
                message: "Invalid movie ID"
            });
        }

        // Validate the complete request body
        const validationErrors = validateMovie(req.body);

        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: validationErrors
            });
        }

        const { title, director, year } = req.body;

        const result = await pool.query(`
            UPDATE movies
            SET
                title = $1,
                director = $2,
                release_year = $3
            WHERE id = $4
            RETURNING
                id,
                title,
                director,
                release_year AS year
        `, [title.trim(), director.trim(), year, id]);

        // Return 404 if no row was updated
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Movie not found"
            });
        }

        res.status(200).json(result.rows[0]);

    } catch (error) {
        next(error);
    }
});

// =====================================
// 8. PATCH - UPDATE PART OF A MOVIE
// =====================================

app.patch("/movies/:id", async (req, res, next) => {
    try {
        const id = validateId(req.params.id);

        if (id === null) {
            return res.status(400).json({
                message: "Invalid movie ID"
            });
        }

        // Server-defined allow-list
        const allowedFields = {
            title: "title",
            director: "director",
            year: "release_year"
        };

        // Reject an empty PATCH body
        const fields = Object.keys(req.body);

        if (fields.length === 0) {
            return res.status(400).json({
                message: "PATCH body cannot be empty"
            });
        }

        // Reject unknown fields
        const invalidFields = fields.filter(
            field => !Object.prototype.hasOwnProperty.call(
                allowedFields,
                field
            )
        );

        if (invalidFields.length > 0) {
            return res.status(400).json({
                message: `Invalid fields: ${invalidFields.join(", ")}`
            });
        }

        // Validate supplied field values
        const validationErrors = validateMovie(req.body, true);

        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: validationErrors
            });
        }

        // Build SET clauses and parameter values
        const setClauses = [];
        const values = [];

        for (const field of fields) {
            let value = req.body[field];

            if (field === "title" || field === "director") {
                value = value.trim();
            }

            values.push(value);

            // Column comes only from the server allow-list
            const column = allowedFields[field];
            const placeholder = `$${values.length}`;

            setClauses.push(`${column} = ${placeholder}`);
        }

        // Add ID as the final parameter
        values.push(id);

        const idPlaceholder = `$${values.length}`;

        const query = `
            UPDATE movies
            SET ${setClauses.join(", ")}
            WHERE id = ${idPlaceholder}
            RETURNING
                id,
                title,
                director,
                release_year AS year
        `;

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Movie not found"
            });
        }

        res.status(200).json(result.rows[0]);

    } catch (error) {
        next(error);
    }
});

// =====================================
// 9. DELETE - REMOVE A MOVIE
// =====================================

app.delete("/movies/:id", async (req, res, next) => {
    try {
        const id = validateId(req.params.id);

        if (id === null) {
            return res.status(400).json({
                message: "Invalid movie ID"
            });
        }

        const result = await pool.query(`
            DELETE FROM movies
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Movie not found"
            });
        }

        // 204 response must not contain a body
        res.status(204).send();

    } catch (error) {
        next(error);
    }
});

// =====================================
// 10. UNKNOWN ROUTE HANDLER
// =====================================

app.use((req, res) => {
    sendError(
        res,
        404,
        "ROUTE_NOT_FOUND",
        "The requested route does not exist"
    );
});

// =====================================
// 11. CENTRALIZED ERROR HANDLING
// =====================================

app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) {
        return next(err);
    }

    // Handle malformed JSON request bodies
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return sendError(
            res,
            400,
            "INVALID_JSON",
            "Request body contains invalid JSON"
        );
    }

    sendError(
        res,
        500,
        "INTERNAL_SERVER_ERROR",
        "An unexpected server error occurred"
    );
});

// =====================================
// 12. START SERVER
// =====================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
