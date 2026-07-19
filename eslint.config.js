import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import typescript from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
    js.configs.recommended,
    // strictTypeChecked видит типы, а не только синтаксис: ловит забытые await,
    // небезопасные any из библиотек и условия, которые всегда истинны
    ...typescript.configs.strictTypeChecked,
    ...typescript.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        ...react.configs.flat.recommended,
        ...react.configs.flat['jsx-runtime'], // Required for React 17+
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            // В React обработчик вида onClick={() => setTool('paint')} — норма,
            // а правило требует обернуть тело в скобки. Отключаем ровно этот
            // случай штатной опцией, остальное правило работает.
            '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
            // числа в шаблонных строках нужны постоянно: координаты, размеры
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
            // useForm от Inertia требует индексную сигнатуру, а её даёт только
            // type-алиас: interface структурно под FormDataType не подходит.
            // Правило чисто стилистическое, и здесь оно спорит с библиотекой.
            '@typescript-eslint/consistent-type-definitions': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'react/no-unescaped-entities': 'off',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
    {
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
        },
    },
    {
        ignores: ['vendor', 'node_modules', 'public', 'bootstrap/ssr', 'tailwind.config.js', 'eslint.config.js'],
    },
    prettier, // Turn off all rules that might conflict with Prettier
];
