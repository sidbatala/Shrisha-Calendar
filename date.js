// date.js – Pure Gregorian calendar calculations (Sakamoto's algorithm)
window.DateCalc = (function() {
    "use strict";

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    }

    // month: 0-indexed (0 = January)
    function getDaysInMonth(year, month) {
        if (month === 1) { // February
            return isLeapYear(year) ? 29 : 28;
        }
        if (month === 3 || month === 5 || month === 8 || month === 10) {
            return 30;
        }
        return 31;
    }

    // month: 0-indexed, returns 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    function getFirstWeekday(year, month) {
        // Tomohiko Sakamoto's algorithm
        const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
        let y = year;
        let m = month + 1; // convert to 1-indexed
        if (m < 3) y--;
        const dow = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + 1) % 7;
        return dow;
    }

    return {
        isLeapYear: isLeapYear,
        getDaysInMonth: getDaysInMonth,
        getFirstWeekday: getFirstWeekday
    };
})();