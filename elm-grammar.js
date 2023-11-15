
/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  COMMENT: 1,
  STRING: 2, // In a string, prefer string characters over comments
  FIELD_ACCESS_START: 1,
  PART: 1,
  FUNCTION_START: 1,
  CASE_OF_BRANCH: 6,
  FUNC: 10,
};

module.exports = grammar({
  name: "elm",

  conflicts: ($) => [
    [$.upper_case_qid, $.value_qid],
    [$.function_call_expr],
    [$.case_of_expr],
    [$._function_call_target, $._atom],
  ],

  externals: ($) => [
    $._virtual_end_decl,
    $._virtual_open_section,
    $._virtual_end_section,
    $.minus_without_trailing_whitespace,
    $.glsl_content,
    $._block_comment_content,
  ],

  extras: ($) => [
    $.block_comment,
    $.line_comment,
    /[\s\uFEFF\u2060\u200B]|\\\r?\n/,
  ],

  word: ($) => $.lower_case_identifier,

  rules: {
    file: ($) =>
      seq(
        optional(
          seq(
            field("moduleDeclaration", $.module_declaration),
            $._virtual_end_decl
          )
        ),
        optional($._import_list),
        optional($._top_decl_list)
      ),

    block_comment: ($) =>
      prec(PREC.COMMENT, seq("{-", $._block_comment_content, "-}")),

    line_comment: ($) => token(prec(PREC.COMMENT, seq(/--/, repeat(/[^\n]/)))),

    module_declaration: ($) =>
      prec.left(
        choice(
          seq(
            optional($.port),
            $.module,
            field("name", $.upper_case_qid),
            field("exposing", $.exposing_list)
          ),
          seq(
            $.effect,
            $.module,
            field("name", $.upper_case_qid),
            $.where,
            $.record_expr,
            field("exposing", $.exposing_list)
          )
        )
      ),

    _import_list: ($) => repeat1(seq($.import_clause, $._virtual_end_decl)),
    _top_decl_list: ($) =>
      repeat1(
        seq(
          choice(
            $.value_declaration,
            $.type_alias_declaration,
            $.type_declaration,
            $.type_annotation,
            $.port_annotation,
            $.infix_declaration
          ),
          $._virtual_end_decl
        )
      ),

    // MODULE DECLARATION

    exposing_list: ($) =>
      seq(
        $.exposing,
        "(",
        choice(
          field("doubleDot", $.double_dot),
          commaSep1(
            choice($.exposed_value, $.exposed_type, $.exposed_operator),
            ","
          )
        ),
        ")"
      ),

    exposed_value: ($) => $.lower_case_identifier,

    exposed_type: ($) =>
      seq($.upper_case_identifier, optional($.exposed_union_constructors)),

    exposed_union_constructors: ($) => seq("(", $.double_dot, ")"),

    exposed_union_constructor: ($) => $.upper_case_identifier,

    exposed_operator: ($) => $._operator_as_function_inner,

    // WHITESPACE-SENSITIVE RULES
    _upper_case_identifier_without_leading_whitespace: ($) =>
      token.immediate(/\p{Lu}[_\d\p{L}]*/),

    _lower_case_identifier_without_leading_whitespace: ($) =>
      token.immediate(/\p{Ll}[_\d\p{L}]*/),

    _dot_without_leading_whitespace: ($) => token.immediate("."),

    upper_case_qid: ($) =>
      prec.right(
        seq(
          $.upper_case_identifier,
          repeat(
            seq(
              alias($._dot_without_leading_whitespace, $.dot),
              alias(
                $._upper_case_identifier_without_leading_whitespace,
                $.upper_case_identifier
              )
            )
          )
        )
      ),

    value_qid: ($) =>
      choice(
        $.lower_case_identifier,
        seq(
          $.upper_case_identifier,
          alias($._dot_without_leading_whitespace, $.dot),
          repeat(
            seq(
              alias(
                $._upper_case_identifier_without_leading_whitespace,
                $.upper_case_identifier
              ),
              alias($._dot_without_leading_whitespace, $.dot)
            )
          ),
          alias(
            $._lower_case_identifier_without_leading_whitespace,
            $.lower_case_identifier
          )
        )
      ),

    field_accessor_function_expr: ($) =>
      seq(
        $.dot,
        alias(
          $._lower_case_identifier_without_leading_whitespace,
          $.lower_case_identifier
        )
      ),

    // IMPORT DECLARATION
    import_clause: ($) =>
      seq(
        $.import,
        field("moduleName", $.upper_case_qid),
        field("asClause", optional($.as_clause)),
        field("exposing", optional($.exposing_list))
      ),

    as_clause: ($) => seq($.as, field("name", $.upper_case_identifier)),

    // TOP-LEVEL DECLARATION

    value_declaration: ($) =>
      seq(
        choice(
          field("functionDeclarationLeft", $.function_declaration_left),
          field("pattern", $.pattern)
        ),
        $.eq,
        field("body", $._expression)
      ),

    function_declaration_left: ($) =>
      prec(
        PREC.FUNCTION_START,
        seq(
          $.lower_case_identifier,
          field(
            "pattern",
            repeat(
              choice(
                $.anything_pattern,
                $.lower_pattern,
                $.tuple_pattern,
                $.unit_expr,
                $.list_pattern,
                $.record_pattern,
                $._literal_expr_group,
                $._parenthesized_pattern
              )
            )
          )
        )
      ),

    // TYPE DECLARATIONS AND REFERENCES

    type_declaration: ($) =>
      prec.left(
        seq(
          $.type,
          field("name", $.upper_case_identifier),
          field("typeName", repeat($.lower_type_name)),
          $.eq,
          field("unionVariant", $.union_variant),
          repeat($._more_union_variants)
        )
      ),

    lower_type_name: ($) => $.lower_case_identifier,

    union_variant: ($) =>
      prec.left(
        seq(
          field("name", $.upper_case_identifier),
          repeat($._single_type_expression)
        )
      ),

    _more_union_variants: ($) =>
      seq("|", field("unionVariant", $.union_variant)),

    type_alias_declaration: ($) =>
      seq(
        $.type,
        $.alias,
        field("name", $.upper_case_identifier),
        field("typeVariable", repeat($.lower_type_name)),
        $.eq,
        field("typeExpression", $.type_expression)
      ),

    type_expression: ($) => arrowSep1($._type_expression_inner, $.arrow),

    _type_expression_inner: ($) =>
      choice($.type_ref, $._single_type_expression),

    type_ref: ($) => seq($.upper_case_qid, repeat1($._single_type_expression)),

    _single_type_expression: ($) =>
      choice(
        field("part", alias($.type_ref_without_args, $.type_ref)),
        field("part", $.type_variable),
        field("part", $.record_type),
        field("part", $.tuple_type),
        seq("(", field("part", $.type_expression), ")")
      ),

    type_ref_without_args: ($) => $.upper_case_qid,

    type_variable: ($) => $.lower_case_identifier,

    record_type: ($) =>
      seq(
        "{",
        optional(
          seq(
            optional($._record_base),
            commaSep1(field("fieldType", $.field_type), ",")
          )
        ),
        "}"
      ),

    field_type: ($) =>
      seq(
        field("name", $.lower_case_identifier),
        $.colon,
        field("typeExpression", $.type_expression)
      ),

    tuple_type: ($) =>
      choice(
        field("unitExpr", $.unit_expr),
        seq(
          "(",
          field("typeExpression", $.type_expression),
          repeat1(seq(",", field("typeExpression", $.type_expression))),
          ")"
        )
      ),

    type_annotation: ($) =>
      seq(
        field("name", $.lower_case_identifier),
        $.colon,
        field("typeExpression", $.type_expression)
      ),

    port_annotation: ($) =>
      seq(
        $.port,
        field("name", $.lower_case_identifier),
        $.colon,
        field("typeExpression", $.type_expression)
      ),

    // EXPRESSIONS

    _expression: ($) => choice($.bin_op_expr, $._call_or_atom),

    bin_op_expr: ($) =>
      field(
        "part",
        prec(
          PREC.PART,
          seq(
            $._call_or_atom,
            prec.right(repeat1(seq($.operator, $._call_or_atom)))
          )
        )
      ),

    operator: ($) => $.operator_identifier,

    operator_as_function_expr: ($) => $._operator_as_function_inner,

    _operator_as_function_inner: ($) =>
      seq("(", field("operator", $.operator_identifier), ")"),

    _call_or_atom: ($) => choice($.function_call_expr, $._atom),

    function_call_expr: ($) =>
      prec.dynamic(
        PREC.FUNC,
        seq(
          field("target", $._function_call_target),
          field("arg", repeat1($._atom))
        )
      ),

    _function_call_target: ($) =>
      choice(
        $.field_access_expr,
        $.value_expr,
        $.field_accessor_function_expr,
        $.operator_as_function_expr,
        $.parenthesized_expr
      ),

    _atom: ($) =>
      choice(
        $._literal_expr_group,
        $.negate_expr,
        $.field_access_expr,
        $.value_expr,
        $.field_accessor_function_expr,
        $.operator_as_function_expr,
        $.parenthesized_expr,
        $.unit_expr,
        $.tuple_expr,
        $.list_expr,
        $.record_expr,
        $.if_else_expr,
        $.case_of_expr,
        $.let_in_expr,
        $.anonymous_function_expr,
        $.glsl_code_expr
      ),

    field_access_expr: ($) =>
      prec.left(
        seq(
          field("target", $._field_access_start),
          repeat1($._field_access_segment)
        )
      ),

    _field_access_start: ($) =>
      prec(
        PREC.FIELD_ACCESS_START,
        choice(
          $.field_access_expr,
          choice($.value_expr, $.parenthesized_expr, $.record_expr)
        )
      ),

    _field_access_segment: ($) =>
      prec.left(
        seq(
          alias($._dot_without_leading_whitespace, $.dot),
          alias(
            $._lower_case_identifier_without_leading_whitespace,
            $.lower_case_identifier
          )
        )
      ),

    negate_expr: ($) =>
      seq(
        alias($.minus_without_trailing_whitespace, $.operator_identifier),
        $._atom
      ), // todo disallow whitespace

    parenthesized_expr: ($) =>
      seq("(", field("expression", $._expression), ")"),

    _literal_expr_group: ($) =>
      choice(
        $.char_constant_expr,
        $.number_constant_expr,
        $.string_constant_expr
      ),

    char_constant_expr: ($) =>
      seq(
        alias("'", $.open_char),
        choice(
          alias(token(/[^\\\n']/), $.regular_string_part),
          $.string_escape,
          $.invalid_string_escape
        ),
        alias("'", $.close_char)
      ),

    number_constant_expr: ($) => $.number_literal,

    string_constant_expr: ($) =>
      choice(
        seq(
          alias('"""', $.open_quote),
          repeat(
            choice(
              alias(
                token.immediate(
                  prec(
                    PREC.STRING,
                    repeat1(choice(/[^\\"]/, /"[^"]/, /""[^"]/))
                  )
                ),
                $.regular_string_part
              ),
              $.string_escape,
              $.invalid_string_escape
            )
          ),
          alias('"""', $.close_quote)
        ),
        seq(
          alias('"', $.open_quote),
          repeat(
            choice(
              alias(
                token.immediate(prec(PREC.STRING, repeat1(/[^\\"\n]/))),
                $.regular_string_part
              ),
              $.string_escape,
              $.invalid_string_escape
            )
          ),
          alias('"', $.close_quote)
        )
      ),

    anonymous_function_expr: ($) =>
      seq(
        $.backslash,
        field("param", repeat1($.pattern)),
        $.arrow,
        field("expr", $._expression)
      ),

    value_expr: ($) => field("name", choice($.value_qid, $.upper_case_qid)),

    tuple_expr: ($) =>
      seq(
        "(",
        field("expr", $._expression),
        repeat1(seq(",", field("expr", $._expression))),
        ")"
      ),

    unit_expr: ($) => seq("(", ")"),

    list_expr: ($) =>
      seq("[", optional(commaSep1(field("exprList", $._expression), ",")), "]"),

    record_expr: ($) => seq("{", optional($._record_inner), "}"),

    record_base_identifier: ($) => $.lower_case_identifier,

    _record_base: ($) =>
      seq(field("baseRecord", $.record_base_identifier), "|"),

    _record_inner: ($) =>
      seq(optional($._record_base), commaSep1(field("field", $.field), ",")),

    field: ($) =>
      seq(
        field("name", $.lower_case_identifier),
        $.eq,
        field("expression", $._expression)
      ),

    if_else_expr: ($) =>
      seq(
        $._if,
        $._then,
        repeat(prec.left(seq("else", $._if, $._then))),
        $._else
      ),

    _if: ($) => seq("if", field("exprList", $._expression)),
    _then: ($) => seq("then", field("exprList", $._expression)),
    _else: ($) => seq("else", field("exprList", $._expression)),

    case_of_expr: ($) =>
      choice(
        seq(
          "(",
          $.case,
          field("expr", $._expression),
          $.of,
          $._virtual_open_section,
          field("branch", $.case_of_branch),
          optional($._more_case_of_branches),
          optional($._virtual_end_section),
          ")"
        ),
        seq(
          $.case,
          field("expr", $._expression),
          $.of,
          $._virtual_open_section,
          field("branch", $.case_of_branch),
          optional($._more_case_of_branches),
          $._virtual_end_section
        )
      ),

    _more_case_of_branches: ($) =>
      prec.dynamic(
        PREC.CASE_OF_BRANCH,
        repeat1(seq($._virtual_end_decl, field("branch", $.case_of_branch)))
      ),

    case_of_branch: ($) =>
      seq(field("pattern", $.pattern), $.arrow, field("expr", $._expression)),

    let_in_expr: ($) =>
      seq(
        "let",
        $._virtual_open_section,
        $._inner_declaration,
        optional(repeat1(seq($._virtual_end_decl, $._inner_declaration))),
        $._virtual_end_section,
        "in",
        field("body", $._expression)
      ),

    _inner_declaration: ($) =>
      choice(field("valueDeclaration", $.value_declaration), $.type_annotation),

    // PATTERNS

    pattern: ($) =>
      seq(
        choice(field("child", $.cons_pattern), $._single_pattern),
        optional(seq($.as, field("patternAs", $.lower_pattern)))
      ),

    cons_pattern: ($) =>
      seq(
        field("part", $._single_pattern_cons),
        seq("::", field("part", choice($.cons_pattern, $._single_pattern_cons)))
      ),

    _single_pattern_cons: ($) =>
      choice(
        $._parenthesized_pattern,
        $.anything_pattern,
        $.lower_pattern,
        $.union_pattern,
        $.tuple_pattern,
        $.unit_expr,
        $.list_pattern,
        $.record_pattern,
        $._literal_expr_group
      ),

    _single_pattern: ($) =>
      choice(
        seq("(", field("child", $.pattern), ")"),
        field("child", $.anything_pattern),
        field("child", $.lower_pattern),
        field("child", $.union_pattern),
        field("child", $.tuple_pattern),
        field("child", $.unit_expr),
        field("child", $.list_pattern),
        field("child", $.record_pattern),
        field("child", $._literal_expr_group)
      ),

    lower_pattern: ($) => $.lower_case_identifier,

    anything_pattern: ($) => $.underscore,

    record_pattern: ($) =>
      seq("{", commaSep1(field("patternList", $.lower_pattern), ","), "}"),

    list_pattern: ($) =>
      seq("[", optional(commaSep1(field("part", $.pattern), ",")), "]"),

    union_pattern: ($) =>
      prec.left(
        seq(
          field("constructor", $.upper_case_qid),
          field("argPattern", repeat($._union_argument_pattern))
        )
      ),

    nullary_constructor_argument_pattern: ($) => $.upper_case_qid,

    _union_argument_pattern: ($) =>
      choice(
        $.anything_pattern,
        $.lower_pattern,
        $.tuple_pattern,
        $.nullary_constructor_argument_pattern,
        $.unit_expr,
        $.list_pattern,
        $.record_pattern,
        $._literal_expr_group,
        $._parenthesized_pattern
      ),

    tuple_pattern: ($) =>
      seq(
        "(",
        field("pattern", $.pattern),
        ",",
        commaSep1(field("pattern", $.pattern), ","),
        ")"
      ),

    _parenthesized_pattern: ($) => seq("(", $.pattern, ")"),

    // MISC
    infix_declaration: ($) =>
      seq(
        $.infix,
        field(
          "associativity",
          alias(choice("left", "right", "non"), $.lower_case_identifier)
        ),
        field("precedence", $.number_literal),
        $._operator_as_function_inner,
        $.eq,
        $.value_expr
      ),

    glsl_code_expr: ($) =>
      seq($._glsl_begin, field("content", $.glsl_content), $._glsl_end),

    _glsl_begin: ($) => "[glsl|",
    _glsl_end: ($) => "|]",

    // Stuff from lexer

    // Should be /\p{Lu}[_\d\p{L}]*/,
    upper_case_identifier: ($) =>
      /[A-Z\u00C0-\u00D6\u00D8-\u00DE\u0100\u0102\u0104\u0106\u0108\u010A\u010C\u010E\u0110\u0112\u0114\u0116\u0118\u011A\u011C\u011E\u0120\u0122\u0124\u0126\u0128\u012A\u012C\u012E\u0130\u0132\u0134\u0136\u0139\u013B\u013D\u013F\u0141\u0143\u0145\u0147\u014A\u014C\u014E\u0150\u0152\u0154\u0156\u0158\u015A\u015C\u015E\u0160\u0162\u0164\u0166\u0168\u016A\u016C\u016E\u0170\u0172\u0174\u0176\u0178\u0179\u017B\u017D\u0181\u0182\u0184\u0186\u0187\u0189-\u018B\u018E-\u0191\u0193\u0194\u0196-\u0198\u019C\u019D\u019F\u01A0\u01A2\u01A4\u01A6\u01A7\u01A9\u01AC\u01AE\u01AF\u01B1-\u01B3\u01B5\u01B7\u01B8\u01BC\u01C4\u01C7\u01CA\u01CD\u01CF\u01D1\u01D3\u01D5\u01D7\u01D9\u01DB\u01DE\u01E0\u01E2\u01E4\u01E6\u01E8\u01EA\u01EC\u01EE\u01F1\u01F4\u01F6-\u01F8\u01FA\u01FC\u01FE\u0200\u0202\u0204\u0206\u0208\u020A\u020C\u020E\u0210\u0212\u0214\u0216\u0218\u021A\u021C\u021E\u0220\u0222\u0224\u0226\u0228\u022A\u022C\u022E\u0230\u0232\u023A\u023B\u023D\u023E\u0241\u0243-\u0246\u0248\u024A\u024C\u024E\u0370\u0372\u0376\u037F\u0386\u0388-\u038A\u038C\u038E\u038F\u0391-\u03A1\u03A3-\u03AB\u03CF\u03D2-\u03D4\u03D8\u03DA\u03DC\u03DE\u03E0\u03E2\u03E4\u03E6\u03E8\u03EA\u03EC\u03EE\u03F4\u03F7\u03F9\u03FA\u03FD-\u042F\u0460\u0462\u0464\u0466\u0468\u046A\u046C\u046E\u0470\u0472\u0474\u0476\u0478\u047A\u047C\u047E\u0480\u048A\u048C\u048E\u0490\u0492\u0494\u0496\u0498\u049A\u049C\u049E\u04A0\u04A2\u04A4\u04A6\u04A8\u04AA\u04AC\u04AE\u04B0\u04B2\u04B4\u04B6\u04B8\u04BA\u04BC\u04BE\u04C0\u04C1\u04C3\u04C5\u04C7\u04C9\u04CB\u04CD\u04D0\u04D2\u04D4\u04D6\u04D8\u04DA\u04DC\u04DE\u04E0\u04E2\u04E4\u04E6\u04E8\u04EA\u04EC\u04EE\u04F0\u04F2\u04F4\u04F6\u04F8\u04FA\u04FC\u04FE\u0500\u0502\u0504\u0506\u0508\u050A\u050C\u050E\u0510\u0512\u0514\u0516\u0518\u051A\u051C\u051E\u0520\u0522\u0524\u0526\u0528\u052A\u052C\u052E\u0531-\u0556\u10A0-\u10C5\u10C7\u10CD\u13A0-\u13F5\u1C90-\u1CBA\u1CBD-\u1CBF\u1E00\u1E02\u1E04\u1E06\u1E08\u1E0A\u1E0C\u1E0E\u1E10\u1E12\u1E14\u1E16\u1E18\u1E1A\u1E1C\u1E1E\u1E20\u1E22\u1E24\u1E26\u1E28\u1E2A\u1E2C\u1E2E\u1E30\u1E32\u1E34\u1E36\u1E38\u1E3A\u1E3C\u1E3E\u1E40\u1E42\u1E44\u1E46\u1E48\u1E4A\u1E4C\u1E4E\u1E50\u1E52\u1E54\u1E56\u1E58\u1E5A\u1E5C\u1E5E\u1E60\u1E62\u1E64\u1E66\u1E68\u1E6A\u1E6C\u1E6E\u1E70\u1E72\u1E74\u1E76\u1E78\u1E7A\u1E7C\u1E7E\u1E80\u1E82\u1E84\u1E86\u1E88\u1E8A\u1E8C\u1E8E\u1E90\u1E92\u1E94\u1E9E\u1EA0\u1EA2\u1EA4\u1EA6\u1EA8\u1EAA\u1EAC\u1EAE\u1EB0\u1EB2\u1EB4\u1EB6\u1EB8\u1EBA\u1EBC\u1EBE\u1EC0\u1EC2\u1EC4\u1EC6\u1EC8\u1ECA\u1ECC\u1ECE\u1ED0\u1ED2\u1ED4\u1ED6\u1ED8\u1EDA\u1EDC\u1EDE\u1EE0\u1EE2\u1EE4\u1EE6\u1EE8\u1EEA\u1EEC\u1EEE\u1EF0\u1EF2\u1EF4\u1EF6\u1EF8\u1EFA\u1EFC\u1EFE\u1F08-\u1F0F\u1F18-\u1F1D\u1F28-\u1F2F\u1F38-\u1F3F\u1F48-\u1F4D\u1F59\u1F5B\u1F5D\u1F5F\u1F68-\u1F6F\u1FB8-\u1FBB\u1FC8-\u1FCB\u1FD8-\u1FDB\u1FE8-\u1FEC\u1FF8-\u1FFB\u2102\u2107\u210B-\u210D\u2110-\u2112\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u2130-\u2133\u213E\u213F\u2145\u2183\u2C00-\u2C2E\u2C60\u2C62-\u2C64\u2C67\u2C69\u2C6B\u2C6D-\u2C70\u2C72\u2C75\u2C7E-\u2C80\u2C82\u2C84\u2C86\u2C88\u2C8A\u2C8C\u2C8E\u2C90\u2C92\u2C94\u2C96\u2C98\u2C9A\u2C9C\u2C9E\u2CA0\u2CA2\u2CA4\u2CA6\u2CA8\u2CAA\u2CAC\u2CAE\u2CB0\u2CB2\u2CB4\u2CB6\u2CB8\u2CBA\u2CBC\u2CBE\u2CC0\u2CC2\u2CC4\u2CC6\u2CC8\u2CCA\u2CCC\u2CCE\u2CD0\u2CD2\u2CD4\u2CD6\u2CD8\u2CDA\u2CDC\u2CDE\u2CE0\u2CE2\u2CEB\u2CED\u2CF2\uA640\uA642\uA644\uA646\uA648\uA64A\uA64C\uA64E\uA650\uA652\uA654\uA656\uA658\uA65A\uA65C\uA65E\uA660\uA662\uA664\uA666\uA668\uA66A\uA66C\uA680\uA682\uA684\uA686\uA688\uA68A\uA68C\uA68E\uA690\uA692\uA694\uA696\uA698\uA69A\uA722\uA724\uA726\uA728\uA72A\uA72C\uA72E\uA732\uA734\uA736\uA738\uA73A\uA73C\uA73E\uA740\uA742\uA744\uA746\uA748\uA74A\uA74C\uA74E\uA750\uA752\uA754\uA756\uA758\uA75A\uA75C\uA75E\uA760\uA762\uA764\uA766\uA768\uA76A\uA76C\uA76E\uA779\uA77B\uA77D\uA77E\uA780\uA782\uA784\uA786\uA78B\uA78D\uA790\uA792\uA796\uA798\uA79A\uA79C\uA79E\uA7A0\uA7A2\uA7A4\uA7A6\uA7A8\uA7AA-\uA7AE\uA7B0-\uA7B4\uA7B6\uA7B8\uA7BA\uA7BC\uA7BE\uA7C2\uA7C4-\uA7C6\uFF21-\uFF3A\U00010400-\U00010427\U000104B0-\U000104D3\U00010C80-\U00010CB2\U000118A0-\U000118BF\U00016E40-\U00016E5F\U0001D400-\U0001D419\U0001D434-\U0001D44D\U0001D468-\U0001D481\U0001D49C\U0001D49E\U0001D49F\U0001D4A2\U0001D4A5\U0001D4A6\U0001D4A9-\U0001D4AC\U0001D4AE-\U0001D4B5\U0001D4D0-\U0001D4E9\U0001D504\U0001D505\U0001D507-\U0001D50A\U0001D50D-\U0001D514\U0001D516-\U0001D51C\U0001D538\U0001D539\U0001D53B-\U0001D53E\U0001D540-\U0001D544\U0001D546\U0001D54A-\U0001D550\U0001D56C-\U0001D585\U0001D5A0-\U0001D5B9\U0001D5D4-\U0001D5ED\U0001D608-\U0001D621\U0001D63C-\U0001D655\U0001D670-\U0001D689\U0001D6A8-\U0001D6C0\U0001D6E2-\U0001D6FA\U0001D71C-\U0001D734\U0001D756-\U0001D76E\U0001D790-\U0001D7A8\U0001D7CA\U0001E900-\U0001E921][0-9A-Z_a-z\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEF\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7BF\uA7C2-\uA7C6\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB67\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\U00010000-\U0001000B\U0001000D-\U00010026\U00010028-\U0001003A\U0001003C\U0001003D\U0001003F-\U0001004D\U00010050-\U0001005D\U00010080-\U000100FA\U00010280-\U0001029C\U000102A0-\U000102D0\U00010300-\U0001031F\U0001032D-\U00010340\U00010342-\U00010349\U00010350-\U00010375\U00010380-\U0001039D\U000103A0-\U000103C3\U000103C8-\U000103CF\U00010400-\U0001049D\U000104B0-\U000104D3\U000104D8-\U000104FB\U00010500-\U00010527\U00010530-\U00010563\U00010600-\U00010736\U00010740-\U00010755\U00010760-\U00010767\U00010800-\U00010805\U00010808\U0001080A-\U00010835\U00010837\U00010838\U0001083C\U0001083F-\U00010855\U00010860-\U00010876\U00010880-\U0001089E\U000108E0-\U000108F2\U000108F4\U000108F5\U00010900-\U00010915\U00010920-\U00010939\U00010980-\U000109B7\U000109BE\U000109BF\U00010A00\U00010A10-\U00010A13\U00010A15-\U00010A17\U00010A19-\U00010A35\U00010A60-\U00010A7C\U00010A80-\U00010A9C\U00010AC0-\U00010AC7\U00010AC9-\U00010AE4\U00010B00-\U00010B35\U00010B40-\U00010B55\U00010B60-\U00010B72\U00010B80-\U00010B91\U00010C00-\U00010C48\U00010C80-\U00010CB2\U00010CC0-\U00010CF2\U00010D00-\U00010D23\U00010F00-\U00010F1C\U00010F27\U00010F30-\U00010F45\U00010FE0-\U00010FF6\U00011003-\U00011037\U00011083-\U000110AF\U000110D0-\U000110E8\U00011103-\U00011126\U00011144\U00011150-\U00011172\U00011176\U00011183-\U000111B2\U000111C1-\U000111C4\U000111DA\U000111DC\U00011200-\U00011211\U00011213-\U0001122B\U00011280-\U00011286\U00011288\U0001128A-\U0001128D\U0001128F-\U0001129D\U0001129F-\U000112A8\U000112B0-\U000112DE\U00011305-\U0001130C\U0001130F\U00011310\U00011313-\U00011328\U0001132A-\U00011330\U00011332\U00011333\U00011335-\U00011339\U0001133D\U00011350\U0001135D-\U00011361\U00011400-\U00011434\U00011447-\U0001144A\U0001145F\U00011480-\U000114AF\U000114C4\U000114C5\U000114C7\U00011580-\U000115AE\U000115D8-\U000115DB\U00011600-\U0001162F\U00011644\U00011680-\U000116AA\U000116B8\U00011700-\U0001171A\U00011800-\U0001182B\U000118A0-\U000118DF\U000118FF\U000119A0-\U000119A7\U000119AA-\U000119D0\U000119E1\U000119E3\U00011A00\U00011A0B-\U00011A32\U00011A3A\U00011A50\U00011A5C-\U00011A89\U00011A9D\U00011AC0-\U00011AF8\U00011C00-\U00011C08\U00011C0A-\U00011C2E\U00011C40\U00011C72-\U00011C8F\U00011D00-\U00011D06\U00011D08\U00011D09\U00011D0B-\U00011D30\U00011D46\U00011D60-\U00011D65\U00011D67\U00011D68\U00011D6A-\U00011D89\U00011D98\U00011EE0-\U00011EF2\U00012000-\U00012399\U00012480-\U00012543\U00013000-\U0001342E\U00014400-\U00014646\U00016800-\U00016A38\U00016A40-\U00016A5E\U00016AD0-\U00016AED\U00016B00-\U00016B2F\U00016B40-\U00016B43\U00016B63-\U00016B77\U00016B7D-\U00016B8F\U00016E40-\U00016E7F\U00016F00-\U00016F4A\U00016F50\U00016F93-\U00016F9F\U00016FE0\U00016FE1\U00016FE3\U00017000-\U000187F7\U00018800-\U00018AF2\U0001B000-\U0001B11E\U0001B150-\U0001B152\U0001B164-\U0001B167\U0001B170-\U0001B2FB\U0001BC00-\U0001BC6A\U0001BC70-\U0001BC7C\U0001BC80-\U0001BC88\U0001BC90-\U0001BC99\U0001D400-\U0001D454\U0001D456-\U0001D49C\U0001D49E\U0001D49F\U0001D4A2\U0001D4A5\U0001D4A6\U0001D4A9-\U0001D4AC\U0001D4AE-\U0001D4B9\U0001D4BB\U0001D4BD-\U0001D4C3\U0001D4C5-\U0001D505\U0001D507-\U0001D50A\U0001D50D-\U0001D514\U0001D516-\U0001D51C\U0001D51E-\U0001D539\U0001D53B-\U0001D53E\U0001D540-\U0001D544\U0001D546\U0001D54A-\U0001D550\U0001D552-\U0001D6A5\U0001D6A8-\U0001D6C0\U0001D6C2-\U0001D6DA\U0001D6DC-\U0001D6FA\U0001D6FC-\U0001D714\U0001D716-\U0001D734\U0001D736-\U0001D74E\U0001D750-\U0001D76E\U0001D770-\U0001D788\U0001D78A-\U0001D7A8\U0001D7AA-\U0001D7C2\U0001D7C4-\U0001D7CB\U0001E100-\U0001E12C\U0001E137-\U0001E13D\U0001E14E\U0001E2C0-\U0001E2EB\U0001E800-\U0001E8C4\U0001E900-\U0001E943\U0001E94B\U0001EE00-\U0001EE03\U0001EE05-\U0001EE1F\U0001EE21\U0001EE22\U0001EE24\U0001EE27\U0001EE29-\U0001EE32\U0001EE34-\U0001EE37\U0001EE39\U0001EE3B\U0001EE42\U0001EE47\U0001EE49\U0001EE4B\U0001EE4D-\U0001EE4F\U0001EE51\U0001EE52\U0001EE54\U0001EE57\U0001EE59\U0001EE5B\U0001EE5D\U0001EE5F\U0001EE61\U0001EE62\U0001EE64\U0001EE67-\U0001EE6A\U0001EE6C-\U0001EE72\U0001EE74-\U0001EE77\U0001EE79-\U0001EE7C\U0001EE7E\U0001EE80-\U0001EE89\U0001EE8B-\U0001EE9B\U0001EEA1-\U0001EEA3\U0001EEA5-\U0001EEA9\U0001EEAB-\U0001EEBB\U00020000-\U0002A6D6\U0002A700-\U0002B734\U0002B740-\U0002B81D\U0002B820-\U0002CEA1\U0002CEB0-\U0002EBE0\U0002F800-\U0002FA1D]*/,

    // Should be /\p{Ll}[_\d\p{L}]*/,
    lower_case_identifier: ($) =>
      /[a-z\u00B5\u00DF-\u00F6\u00F8-\u00FF\u0101\u0103\u0105\u0107\u0109\u010B\u010D\u010F\u0111\u0113\u0115\u0117\u0119\u011B\u011D\u011F\u0121\u0123\u0125\u0127\u0129\u012B\u012D\u012F\u0131\u0133\u0135\u0137\u0138\u013A\u013C\u013E\u0140\u0142\u0144\u0146\u0148\u0149\u014B\u014D\u014F\u0151\u0153\u0155\u0157\u0159\u015B\u015D\u015F\u0161\u0163\u0165\u0167\u0169\u016B\u016D\u016F\u0171\u0173\u0175\u0177\u017A\u017C\u017E-\u0180\u0183\u0185\u0188\u018C\u018D\u0192\u0195\u0199-\u019B\u019E\u01A1\u01A3\u01A5\u01A8\u01AA\u01AB\u01AD\u01B0\u01B4\u01B6\u01B9\u01BA\u01BD-\u01BF\u01C6\u01C9\u01CC\u01CE\u01D0\u01D2\u01D4\u01D6\u01D8\u01DA\u01DC\u01DD\u01DF\u01E1\u01E3\u01E5\u01E7\u01E9\u01EB\u01ED\u01EF\u01F0\u01F3\u01F5\u01F9\u01FB\u01FD\u01FF\u0201\u0203\u0205\u0207\u0209\u020B\u020D\u020F\u0211\u0213\u0215\u0217\u0219\u021B\u021D\u021F\u0221\u0223\u0225\u0227\u0229\u022B\u022D\u022F\u0231\u0233-\u0239\u023C\u023F\u0240\u0242\u0247\u0249\u024B\u024D\u024F-\u0293\u0295-\u02AF\u0371\u0373\u0377\u037B-\u037D\u0390\u03AC-\u03CE\u03D0\u03D1\u03D5-\u03D7\u03D9\u03DB\u03DD\u03DF\u03E1\u03E3\u03E5\u03E7\u03E9\u03EB\u03ED\u03EF-\u03F3\u03F5\u03F8\u03FB\u03FC\u0430-\u045F\u0461\u0463\u0465\u0467\u0469\u046B\u046D\u046F\u0471\u0473\u0475\u0477\u0479\u047B\u047D\u047F\u0481\u048B\u048D\u048F\u0491\u0493\u0495\u0497\u0499\u049B\u049D\u049F\u04A1\u04A3\u04A5\u04A7\u04A9\u04AB\u04AD\u04AF\u04B1\u04B3\u04B5\u04B7\u04B9\u04BB\u04BD\u04BF\u04C2\u04C4\u04C6\u04C8\u04CA\u04CC\u04CE\u04CF\u04D1\u04D3\u04D5\u04D7\u04D9\u04DB\u04DD\u04DF\u04E1\u04E3\u04E5\u04E7\u04E9\u04EB\u04ED\u04EF\u04F1\u04F3\u04F5\u04F7\u04F9\u04FB\u04FD\u04FF\u0501\u0503\u0505\u0507\u0509\u050B\u050D\u050F\u0511\u0513\u0515\u0517\u0519\u051B\u051D\u051F\u0521\u0523\u0525\u0527\u0529\u052B\u052D\u052F\u0560-\u0588\u10D0-\u10FA\u10FD-\u10FF\u13F8-\u13FD\u1C80-\u1C88\u1D00-\u1D2B\u1D6B-\u1D77\u1D79-\u1D9A\u1E01\u1E03\u1E05\u1E07\u1E09\u1E0B\u1E0D\u1E0F\u1E11\u1E13\u1E15\u1E17\u1E19\u1E1B\u1E1D\u1E1F\u1E21\u1E23\u1E25\u1E27\u1E29\u1E2B\u1E2D\u1E2F\u1E31\u1E33\u1E35\u1E37\u1E39\u1E3B\u1E3D\u1E3F\u1E41\u1E43\u1E45\u1E47\u1E49\u1E4B\u1E4D\u1E4F\u1E51\u1E53\u1E55\u1E57\u1E59\u1E5B\u1E5D\u1E5F\u1E61\u1E63\u1E65\u1E67\u1E69\u1E6B\u1E6D\u1E6F\u1E71\u1E73\u1E75\u1E77\u1E79\u1E7B\u1E7D\u1E7F\u1E81\u1E83\u1E85\u1E87\u1E89\u1E8B\u1E8D\u1E8F\u1E91\u1E93\u1E95-\u1E9D\u1E9F\u1EA1\u1EA3\u1EA5\u1EA7\u1EA9\u1EAB\u1EAD\u1EAF\u1EB1\u1EB3\u1EB5\u1EB7\u1EB9\u1EBB\u1EBD\u1EBF\u1EC1\u1EC3\u1EC5\u1EC7\u1EC9\u1ECB\u1ECD\u1ECF\u1ED1\u1ED3\u1ED5\u1ED7\u1ED9\u1EDB\u1EDD\u1EDF\u1EE1\u1EE3\u1EE5\u1EE7\u1EE9\u1EEB\u1EED\u1EEF\u1EF1\u1EF3\u1EF5\u1EF7\u1EF9\u1EFB\u1EFD\u1EFF-\u1F07\u1F10-\u1F15\u1F20-\u1F27\u1F30-\u1F37\u1F40-\u1F45\u1F50-\u1F57\u1F60-\u1F67\u1F70-\u1F7D\u1F80-\u1F87\u1F90-\u1F97\u1FA0-\u1FA7\u1FB0-\u1FB4\u1FB6\u1FB7\u1FBE\u1FC2-\u1FC4\u1FC6\u1FC7\u1FD0-\u1FD3\u1FD6\u1FD7\u1FE0-\u1FE7\u1FF2-\u1FF4\u1FF6\u1FF7\u210A\u210E\u210F\u2113\u212F\u2134\u2139\u213C\u213D\u2146-\u2149\u214E\u2184\u2C30-\u2C5E\u2C61\u2C65\u2C66\u2C68\u2C6A\u2C6C\u2C71\u2C73\u2C74\u2C76-\u2C7B\u2C81\u2C83\u2C85\u2C87\u2C89\u2C8B\u2C8D\u2C8F\u2C91\u2C93\u2C95\u2C97\u2C99\u2C9B\u2C9D\u2C9F\u2CA1\u2CA3\u2CA5\u2CA7\u2CA9\u2CAB\u2CAD\u2CAF\u2CB1\u2CB3\u2CB5\u2CB7\u2CB9\u2CBB\u2CBD\u2CBF\u2CC1\u2CC3\u2CC5\u2CC7\u2CC9\u2CCB\u2CCD\u2CCF\u2CD1\u2CD3\u2CD5\u2CD7\u2CD9\u2CDB\u2CDD\u2CDF\u2CE1\u2CE3\u2CE4\u2CEC\u2CEE\u2CF3\u2D00-\u2D25\u2D27\u2D2D\uA641\uA643\uA645\uA647\uA649\uA64B\uA64D\uA64F\uA651\uA653\uA655\uA657\uA659\uA65B\uA65D\uA65F\uA661\uA663\uA665\uA667\uA669\uA66B\uA66D\uA681\uA683\uA685\uA687\uA689\uA68B\uA68D\uA68F\uA691\uA693\uA695\uA697\uA699\uA69B\uA723\uA725\uA727\uA729\uA72B\uA72D\uA72F-\uA731\uA733\uA735\uA737\uA739\uA73B\uA73D\uA73F\uA741\uA743\uA745\uA747\uA749\uA74B\uA74D\uA74F\uA751\uA753\uA755\uA757\uA759\uA75B\uA75D\uA75F\uA761\uA763\uA765\uA767\uA769\uA76B\uA76D\uA76F\uA771-\uA778\uA77A\uA77C\uA77F\uA781\uA783\uA785\uA787\uA78C\uA78E\uA791\uA793-\uA795\uA797\uA799\uA79B\uA79D\uA79F\uA7A1\uA7A3\uA7A5\uA7A7\uA7A9\uA7AF\uA7B5\uA7B7\uA7B9\uA7BB\uA7BD\uA7BF\uA7C3\uA7FA\uAB30-\uAB5A\uAB60-\uAB67\uAB70-\uABBF\uFB00-\uFB06\uFB13-\uFB17\uFF41-\uFF5A\U00010428-\U0001044F\U000104D8-\U000104FB\U00010CC0-\U00010CF2\U000118C0-\U000118DF\U00016E60-\U00016E7F\U0001D41A-\U0001D433\U0001D44E-\U0001D454\U0001D456-\U0001D467\U0001D482-\U0001D49B\U0001D4B6-\U0001D4B9\U0001D4BB\U0001D4BD-\U0001D4C3\U0001D4C5-\U0001D4CF\U0001D4EA-\U0001D503\U0001D51E-\U0001D537\U0001D552-\U0001D56B\U0001D586-\U0001D59F\U0001D5BA-\U0001D5D3\U0001D5EE-\U0001D607\U0001D622-\U0001D63B\U0001D656-\U0001D66F\U0001D68A-\U0001D6A5\U0001D6C2-\U0001D6DA\U0001D6DC-\U0001D6E1\U0001D6FC-\U0001D714\U0001D716-\U0001D71B\U0001D736-\U0001D74E\U0001D750-\U0001D755\U0001D770-\U0001D788\U0001D78A-\U0001D78F\U0001D7AA-\U0001D7C2\U0001D7C4-\U0001D7C9\U0001D7CB\U0001E922-\U0001E943][0-9A-Z_a-z\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0560-\u0588\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEF\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7BF\uA7C2-\uA7C6\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB67\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\U00010000-\U0001000B\U0001000D-\U00010026\U00010028-\U0001003A\U0001003C\U0001003D\U0001003F-\U0001004D\U00010050-\U0001005D\U00010080-\U000100FA\U00010280-\U0001029C\U000102A0-\U000102D0\U00010300-\U0001031F\U0001032D-\U00010340\U00010342-\U00010349\U00010350-\U00010375\U00010380-\U0001039D\U000103A0-\U000103C3\U000103C8-\U000103CF\U00010400-\U0001049D\U000104B0-\U000104D3\U000104D8-\U000104FB\U00010500-\U00010527\U00010530-\U00010563\U00010600-\U00010736\U00010740-\U00010755\U00010760-\U00010767\U00010800-\U00010805\U00010808\U0001080A-\U00010835\U00010837\U00010838\U0001083C\U0001083F-\U00010855\U00010860-\U00010876\U00010880-\U0001089E\U000108E0-\U000108F2\U000108F4\U000108F5\U00010900-\U00010915\U00010920-\U00010939\U00010980-\U000109B7\U000109BE\U000109BF\U00010A00\U00010A10-\U00010A13\U00010A15-\U00010A17\U00010A19-\U00010A35\U00010A60-\U00010A7C\U00010A80-\U00010A9C\U00010AC0-\U00010AC7\U00010AC9-\U00010AE4\U00010B00-\U00010B35\U00010B40-\U00010B55\U00010B60-\U00010B72\U00010B80-\U00010B91\U00010C00-\U00010C48\U00010C80-\U00010CB2\U00010CC0-\U00010CF2\U00010D00-\U00010D23\U00010F00-\U00010F1C\U00010F27\U00010F30-\U00010F45\U00010FE0-\U00010FF6\U00011003-\U00011037\U00011083-\U000110AF\U000110D0-\U000110E8\U00011103-\U00011126\U00011144\U00011150-\U00011172\U00011176\U00011183-\U000111B2\U000111C1-\U000111C4\U000111DA\U000111DC\U00011200-\U00011211\U00011213-\U0001122B\U00011280-\U00011286\U00011288\U0001128A-\U0001128D\U0001128F-\U0001129D\U0001129F-\U000112A8\U000112B0-\U000112DE\U00011305-\U0001130C\U0001130F\U00011310\U00011313-\U00011328\U0001132A-\U00011330\U00011332\U00011333\U00011335-\U00011339\U0001133D\U00011350\U0001135D-\U00011361\U00011400-\U00011434\U00011447-\U0001144A\U0001145F\U00011480-\U000114AF\U000114C4\U000114C5\U000114C7\U00011580-\U000115AE\U000115D8-\U000115DB\U00011600-\U0001162F\U00011644\U00011680-\U000116AA\U000116B8\U00011700-\U0001171A\U00011800-\U0001182B\U000118A0-\U000118DF\U000118FF\U000119A0-\U000119A7\U000119AA-\U000119D0\U000119E1\U000119E3\U00011A00\U00011A0B-\U00011A32\U00011A3A\U00011A50\U00011A5C-\U00011A89\U00011A9D\U00011AC0-\U00011AF8\U00011C00-\U00011C08\U00011C0A-\U00011C2E\U00011C40\U00011C72-\U00011C8F\U00011D00-\U00011D06\U00011D08\U00011D09\U00011D0B-\U00011D30\U00011D46\U00011D60-\U00011D65\U00011D67\U00011D68\U00011D6A-\U00011D89\U00011D98\U00011EE0-\U00011EF2\U00012000-\U00012399\U00012480-\U00012543\U00013000-\U0001342E\U00014400-\U00014646\U00016800-\U00016A38\U00016A40-\U00016A5E\U00016AD0-\U00016AED\U00016B00-\U00016B2F\U00016B40-\U00016B43\U00016B63-\U00016B77\U00016B7D-\U00016B8F\U00016E40-\U00016E7F\U00016F00-\U00016F4A\U00016F50\U00016F93-\U00016F9F\U00016FE0\U00016FE1\U00016FE3\U00017000-\U000187F7\U00018800-\U00018AF2\U0001B000-\U0001B11E\U0001B150-\U0001B152\U0001B164-\U0001B167\U0001B170-\U0001B2FB\U0001BC00-\U0001BC6A\U0001BC70-\U0001BC7C\U0001BC80-\U0001BC88\U0001BC90-\U0001BC99\U0001D400-\U0001D454\U0001D456-\U0001D49C\U0001D49E\U0001D49F\U0001D4A2\U0001D4A5\U0001D4A6\U0001D4A9-\U0001D4AC\U0001D4AE-\U0001D4B9\U0001D4BB\U0001D4BD-\U0001D4C3\U0001D4C5-\U0001D505\U0001D507-\U0001D50A\U0001D50D-\U0001D514\U0001D516-\U0001D51C\U0001D51E-\U0001D539\U0001D53B-\U0001D53E\U0001D540-\U0001D544\U0001D546\U0001D54A-\U0001D550\U0001D552-\U0001D6A5\U0001D6A8-\U0001D6C0\U0001D6C2-\U0001D6DA\U0001D6DC-\U0001D6FA\U0001D6FC-\U0001D714\U0001D716-\U0001D734\U0001D736-\U0001D74E\U0001D750-\U0001D76E\U0001D770-\U0001D788\U0001D78A-\U0001D7A8\U0001D7AA-\U0001D7C2\U0001D7C4-\U0001D7CB\U0001E100-\U0001E12C\U0001E137-\U0001E13D\U0001E14E\U0001E2C0-\U0001E2EB\U0001E800-\U0001E8C4\U0001E900-\U0001E943\U0001E94B\U0001EE00-\U0001EE03\U0001EE05-\U0001EE1F\U0001EE21\U0001EE22\U0001EE24\U0001EE27\U0001EE29-\U0001EE32\U0001EE34-\U0001EE37\U0001EE39\U0001EE3B\U0001EE42\U0001EE47\U0001EE49\U0001EE4B\U0001EE4D-\U0001EE4F\U0001EE51\U0001EE52\U0001EE54\U0001EE57\U0001EE59\U0001EE5B\U0001EE5D\U0001EE5F\U0001EE61\U0001EE62\U0001EE64\U0001EE67-\U0001EE6A\U0001EE6C-\U0001EE72\U0001EE74-\U0001EE77\U0001EE79-\U0001EE7C\U0001EE7E\U0001EE80-\U0001EE89\U0001EE8B-\U0001EE9B\U0001EEA1-\U0001EEA3\U0001EEA5-\U0001EEA9\U0001EEAB-\U0001EEBB\U00020000-\U0002A6D6\U0002A700-\U0002B734\U0002B740-\U0002B81D\U0002B820-\U0002CEA1\U0002CEB0-\U0002EBE0\U0002F800-\U0002FA1D]*/,

    number_literal: ($) =>
      token(choice(/-?[0-9]+(\.[0-9]+)?(e-?[0-9]+)?/, /0x[0-9A-Fa-f]+/)),

    string_escape: ($) => /\\(u\{[0-9A-Fa-f]{4,6}\}|[nrt\"'\\])/,

    invalid_string_escape: ($) => /\\(u\{[^}]*\}|[^nrt\"'\\])/,

    module: ($) => "module",
    effect: ($) => "effect",
    where: ($) => "where",
    import: ($) => "import",
    as: ($) => "as",
    exposing: ($) => "exposing",
    case: ($) => "case",
    of: ($) => "of",
    type: ($) => "type",
    alias: ($) => "alias",
    port: ($) => "port",
    infix: ($) => "infix",
    double_dot: ($) => "..",
    eq: ($) => "=",
    arrow: ($) => "->",
    colon: ($) => ":",
    backslash: ($) => "\\",
    underscore: ($) => "_",
    dot: ($) => ".",
    operator_identifier: ($) =>
      choice(
        "+",
        "-",
        "*",
        "/",
        "//",
        "^",
        "==",
        "/=",
        "<",
        ">",
        "<=",
        ">=",
        "&&",
        "||",
        "++",
        "<|",
        "|>",
        "<<",
        ">>",
        "::",
        "</>",
        "<?>",
        "|.",
        "|="
      ),
  },
});

function commaSep1(rule, comma) {
  return sep1(rule, comma);
}

function arrowSep1(rule, arrow) {
  return sep1(rule, arrow);
}

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
