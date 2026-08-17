# Omni-Queue 360 Coding Standards

## 1. Clean Code Principles
- **DRY (Don't Repeat Yourself)**: Extract common logic into shared utilities (e.g., `AppError.js`, `validators.js`).
- **SRP (Single Responsibility Principle)**: Keep files focused. If a file grows over 300 lines, consider splitting it.
- **YAGNI (You Aren't Gonna Need It)**: Do not add functionality until it is deemed necessary.

## 2. Formatting & Syntax
- Use 2 spaces for indentation.
- Use `const` over `let` whenever possible. Never use `var`.
- Use arrow functions `=>` for anonymous functions and callbacks.
- File endings must be `LF` (Unix-style).

## 3. Error Handling
- Use the shared `AppError` class and `throwError` helper from `src/utils/AppError.js`.
- Always wrap asynchronous controller functions in `catchAsync`.
- Do not log raw errors directly in controllers; let the global `errorHandler` handle logging.

## 4. Documentation
- Use JSDoc format for all public functions, especially those in `store/` and `services/`.
- Specify parameter types and return types.

## 5. Security & Dependencies
- No magic numbers. Define them in `src/config/constants.js`.
- Always use parameterized queries for Postgres to prevent SQL injection.
- Ensure sensitive environment variables are not hardcoded.
