/* --- Combined and Corrected JavaScript for the Hybrid Calculator --- */

/* ---------- Helpers ---------- */


/** Debounce utility */
function debounce(fn, wait = 120) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), wait);
    };
}

/** Clamp utility */
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/* ---------- DOM Refs ---------- */
const exprEl = document.getElementById('expression');
const resultEl = document.getElementById('result');
const themeBtn = document.getElementById('theme-btn');
const keysContainer = document.querySelector('.keys');
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- State ---------- */
let expr = '0';
let lastEvaluated = null;
let currentTheme = 1;

/* ---------- Display Utilities ---------- */

/** Update the expression display text. */
function setExpressionDisplay(text) {
    exprEl.textContent = text || '0';
}

/** Update result display and optionally animate 3D reveal. */
function setResultDisplay(text, animate = false) {
    resultEl.textContent = text;
    if (animate) {
        resultEl.classList.remove('revealed');
        void resultEl.offsetWidth;
        resultEl.classList.add('revealed');
    }
}

/* ---------- Input Sanitation ---------- */

/** Whether a char is operator */
const isOp = c => ['+', '-', '*', '/', '%'].includes(c);

/** Replace display-friendly symbols with parsable ones */
function sanitizeForParse(s) {
    return s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
}

/** Pretty-print for display (convert * and / to × ÷ and normalize minus) */
function prettifyForDisplay(s) {
    return s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
}

/**
 * Validates if a character can be appended to the expression.
 */
function canAppend(char) {
    const s = expr;
    const last = s.trim().slice(-1);

    // Rule 1: Cannot start with an operator (except unary minus)
    if (s === '0' && isOp(char) && char !== '-') return false;
    
    // Rule 2: No double operators
    if (isOp(last) && isOp(char)) return false;

    // Rule 3: No multiple decimals in a single number
    if (char === '.') {
        const seg = s.split(/[\+\-\*\/\(\)]/).pop();
        if (seg.includes('.')) return false;
    }

    // Rule 4: Cannot place a '%' after an operator
    if (char === '%' && isOp(last)) return false;

    // Rule 5: Cannot place a '(' after a number or decimal
    if (char === '(' && /[0-9.]/.test(last)) return false;
    
    // Rule 6: Cannot place a ')' after an operator or an opening parenthesis
    if (char === ')' && (isOp(last) || last === '(')) return false;

    return true;
}

/* ---------- Parser (Tokenizer + Shunting-Yard + RPN Eval) ---------- */

/** Tokenize numeric literals, operators, parentheses. Support unary minus. */
function tokenize(input) {
    const s = sanitizeForParse(input).replace(/\s+/g, '');
    const tokens = [];
    let i = 0;

    while (i < s.length) {
        const ch = s[i];

        if (/\d|\./.test(ch) || (ch === '-' && (i === 0 || isOp(s[i - 1]) || s[i-1] === '('))) {
            let numStr = '';
            if (ch === '-') {
                numStr += '-';
                i++;
            }
            let hasDot = false;
            while (i < s.length && (/\d/.test(s[i]) || (!hasDot && s[i] === '.'))) {
                if (s[i] === '.') hasDot = true;
                numStr += s[i];
                i++;
            }
            if (numStr === '-' || numStr === '.' || numStr === '-.') {
                throw new Error('Invalid number');
            }
            tokens.push({ type: 'num', value: parseFloat(numStr) });
            continue;
        }

        if (isOp(ch)) {
            tokens.push({ type: 'op', value: ch });
            i++;
            continue;
        }
        
        if (ch === '(' || ch === ')') {
            tokens.push({ type: 'paren', value: ch });
            i++;
            continue;
        }

        throw new Error('Invalid character');
    }
    return tokens;
}

/** Convert infix tokens to RPN using shunting-yard algorithm */
function toRPN(tokens) {
    const output = [];
    const stack = [];

    const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
    const leftAssoc = { '+': true, '-': true, '*': true, '/': true, '%': true };

    for (const t of tokens) {
        if (t.type === 'num') output.push(t);
        else if (t.type === 'op') {
            while (stack.length) {
                const top = stack[stack.length - 1];
                if (top.type === 'op' &&
                    ((leftAssoc[t.value] && prec[t.value] <= prec[top.value]) ||
                        (!leftAssoc[t.value] && prec[t.value] < prec[top.value]))) {
                    output.push(stack.pop());
                } else break;
            }
            stack.push(t);
        } else if (t.type === 'paren' && t.value === '(') {
            stack.push(t);
        } else if (t.type === 'paren' && t.value === ')') {
            let foundLeft = false;
            while (stack.length) {
                const x = stack.pop();
                if (x.type === 'paren' && x.value === '(') {
                    foundLeft = true;
                    break;
                }
                output.push(x);
            }
            if (!foundLeft) throw new Error('Mismatched parentheses');
        }
    }

    while (stack.length) {
        const x = stack.pop();
        if (x.type === 'paren') throw new Error('Mismatched parentheses');
        output.push(x);
    }
    return output;
}

/** Evaluate RPN stack safely */
function evalRPN(rpn) {
    const st = [];
    for (const t of rpn) {
        if (t.type === 'num') st.push(t.value);
        else if (t.type === 'op') {
            const b = st.pop();
            const a = st.pop();
            if (a === undefined || b === undefined) throw new Error('Invalid expression');

            let res;
            switch (t.value) {
                case '+': res = a + b; break;
                case '-': res = a - b; break;
                case '*': res = a * b; break;
                case '/':
                    if (b === 0) throw new Error('Division by zero');
                    res = a / b;
                    break;
                case '%': res = a % b; break;
                default: throw new Error('Unknown operator');
            }
            st.push(res);
        }
    }
    if (st.length !== 1) throw new Error('Invalid expression');
    const out = st[0];
    return Object.is(out, -0) ? 0 : out;
}

/** Try to compute expression; returns { ok, value|message } */
function safeCompute(input) {
    try {
        const tokens = tokenize(input);
        const rpn = toRPN(tokens);
        const value = evalRPN(rpn);
        if (!Number.isFinite(value)) throw new Error('Invalid result');
        return { ok: true, value };
    } catch (e) {
        return { ok: false, message: e.message || 'Invalid expression' };
    }
}

/* ---------- Real-time evaluation (debounced) ---------- */
const liveEvaluate = debounce(() => {
    const sanitized = sanitizeForParse(expr);
    const open = (sanitized.match(/\(/g) || []).length;
    const close = (sanitized.match(/\)/g) || []).length;
    if (open !== close) {
        setResultDisplay('—');
        return;
    }

    const res = safeCompute(sanitized);
    if (res.ok) {
        const value = res.value;
        setResultDisplay(formatNumber(value, 12));
    } else {
        setResultDisplay('—');
    }
}, 140);

/** Format number with max precision while avoiding trailing zeros */
function formatNumber(n, precision = 12) {
    const str = Math.abs(n) > 1e12 || (Math.abs(n) < 1e-6 && n !== 0)
        ? n.toExponential(6)
        : n.toFixed(precision);
    return str.replace(/\.?0+($|e)/, '$1');
}

/* ---------- Button Handling ---------- */

/**
 * Handles the logic for the single parentheses button.
 */
function handleParentheses() {
    const s = expr;
    const last = s.trim().slice(-1);
    const openCount = (s.match(/\(/g) || []).length;
    const closeCount = (s.match(/\)/g) || []).length;
    const isLastCharNumOrParen = /[0-9.)]/.test(last);

    if (openCount > closeCount && !isOp(last) && last !== '(') {
        // Condition to add a closing parenthesis
        expr += ')';
    } else if (isLastCharNumOrParen) {
        // Condition to add an opening parenthesis with implicit multiplication
        expr += '*(';
    } else {
        // Default condition to add an opening parenthesis
        expr = (expr === '0') ? '(' : expr + '(';
    }

    setExpressionDisplay(prettifyForDisplay(expr));
    liveEvaluate();
}

/**
 * Main function to handle all button clicks.
 */
function handleButtonClick(btn) {
    const action = btn.dataset.action;
    const value = btn.dataset.value;

    if (action === 'clear') {
        expr = '0';
        setExpressionDisplay('0');
        setResultDisplay('—');
    } else if (action === 'backspace') {
        if (expr.length <= 1 || expr === '0') expr = '0';
        else expr = expr.slice(0, -1);
        setExpressionDisplay(prettifyForDisplay(expr));
        liveEvaluate();
    } else if (action === 'equals') {
        const res = safeCompute(expr);
        if (res.ok) {
            const out = formatNumber(res.value);
            setResultDisplay(out);
            expr = out;
            setExpressionDisplay(prettifyForDisplay(expr));
        } else {
            setResultDisplay('Error');
        }
    } else if (action === 'parentheses') {
        handleParentheses();
    } else if (value != null) {
        if (canAppend(value)) {
            if (expr === '0' && /[0-9.]/.test(value)) {
                expr = value;
            } else {
                expr += value;
            }
            setExpressionDisplay(prettifyForDisplay(expr));
            liveEvaluate();
        }
    }
}

/* Button events (click + keyboard activation with Space/Enter) */
keysContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    handleButtonClick(btn);
});

/* ---------- Keyboard Shortcuts ---------- */
const keyMap = {};
document.querySelectorAll('.keys button').forEach(btn => {
    const k = btn.dataset.key;
    if (k) keyMap[k] = btn;
});

window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key;
    let targetBtn = keyMap[key];

    if (!targetBtn && /^[0-9]$/.test(key)) targetBtn = document.querySelector(`.keys [data-key="${key}"]`);
    if (!targetBtn && ['.', '+', '-', '*', '/', '%'].includes(key)) {
        targetBtn = document.querySelector(`.keys [data-key="${CSS.escape(key)}"]`);
    }
    if (!targetBtn && (key === 'Backspace' || key === 'Escape')) {
        targetBtn = document.querySelector(`.keys [data-key="${key}"]`);
    }

    if (targetBtn) {
        e.preventDefault();
        handleButtonClick(targetBtn);
    }
});


/* ---------- Theme-switching logic ---------- */
if (themeBtn) {
    themeBtn.addEventListener("click", () => {
        currentTheme++;
        if (currentTheme > 20) currentTheme = 1;  // Changed from 1 to 25
        document.body.className = `theme${currentTheme}`;
    });
}

/* ---------- Initialize defaults ---------- */
setExpressionDisplay(expr);
setResultDisplay('—');