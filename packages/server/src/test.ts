



(() => {

    debugger;

    import('./index.js')

    .catch(error => {
        console.error('Error during application startup:', error);
        // במקרה של שגיאה קריטית, נצא מהתהליך
        process.exit(1);
    });


})(); // This is a no-op function to allow debugging without side effects