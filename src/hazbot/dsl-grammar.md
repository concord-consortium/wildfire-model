> **AUTO-GENERATED — DO NOT EDIT — re-run `scripts/extract-hazbot-sheets.js`**

**Sources:** wildfire task analysis and revision

log data analysis work

## Categories

The categories of student behaviors as summarized in this document are from the first source, a result of log data analysis work plus collective assessment of what important behaviors to capture.  Here, behaviors are defined mostly as student's simulation-use behaviors (but not always; see "Feedback Mechanism" below for the meaning of any category >= 100).  The categories presented here are related to, but quite different from (and simpler than), the categories presented from the log data analysis alone.  Also, the improvements of the new log data format (see next) as well as the revisions of the activities makes certain computations easier now.  The category has a monotonic character in that as student's simulation use behavior improves the category will increase.  However, any category >= 100 is to be identified with the maximum category value below 100, as far as the student's simulation use behavior and the corresponding log data pseudo-code are concerned.  In terms of implementation, a simulation log data analysis module many be responsible for computing any category values below 100, and any category >= 100 may best be computed in a differet module ("feedback mechanism" module, e.g.).

**New Log data format:** https://wildfire.concord.org/branch/new-log-events/index.html?logMonitor=true

## Feedback Mechanism

In this document, feedback contents are those contents that can be brought to student's attention when appropriate.  But, what does it mean "when appropriate"?  Namely, what is the feedback mechanism?  Here it is: the feedback is to be given in response to the student's clicking of a certain button, defined as the "Hazbot Analysis" button.  Related to this feedback mechanism, you will see that any category >= 100 lacks pseudo code.  The reason is the following.  In this document, the log data pseudo code is defined only in terms of student's simulation log data.  And, category >= 100 is defined as a category that does not involve any new simulation-use behavior compared to the maximum category below 100.  In other words, a category >= 100 means that some other notable non-simulation action was taken after the maximum simulation-use category (the maximum value of the category below 100) has been attained.  An example of such a spurious non-simulation action is a repeated unnecessary clicking of the "Hazbot Analysis" button after the feedback for the sub-100 maximum category value was received.

## Pseudo Code for Categories

## Factor Variables

Factor variable names start with a lowercase character and is formatted in Camelcase, e.g., ranSimulation.

**Operators:** AND, OR, NOT, WITH, >, <, ==, !=, >=, <=   (all uppercase or symbols)

## Simulation Property

Simulation property names start with an upper case character, and is formatted in Camelcase, e.g., OneSparkPerZone.  A simulation property defines a property of a collection of simulation runs represented by a factor variable (see the discussion on "Range" below), although often the range of a factor variable is 1, in which case a simulation property is a property of only one simulation run (as in the case of the factor variable "ranSimulation").

**Events:** Event id appearing alone indicate a log event, e.g., SimulationStarted.

## Event data

Event related data are indicated by event id followed by -> and then a cascade of props to evaluate, e.g., SimulationStarted->sparks.<j>.zoneIdx.  The notation .<i> (or .<j>) means taking an array element at index variable i where i can run from 0 to array length - 1.

## Code Evaluation Order

The highest category must be tested first.  If any category succeeds, then stop.  If fails, then test the next lower category.

## Real Time Use

On accepting a new log data event, only those categories greater than the previously calculated category need be tested.  Namely, on consuming a new log event, the category can only increase.

## The Range of Factor Variable

Some factor variables concern properties of only one simulation run, and some a relationship between two successive ones.  Generally, there may be a factor that involve relations among multiple successive simulation runs.  Let us call such number of successive simulation runs the "range".  The range of a typical factor variable is only 1 or 2, and so it is computationally effective to update such factor variables on consuming a new log event.  (From 23 through 35, all factor variables are range 1.  Some range 2 factor variables are anticipated for old version activities 43 through 47.)

## WITH

While all operators may be familiar, WITH may not be.  Here is the definition.

**1:** WITH is followed by a simulation property (hitherto referred to as "prop" in short) or, more generally, any operations involving props only ("prop expression").

**2:** A prop expression starts with a prop name, consists only of operators and prop names, and ends right after the last prop name not followed by any more prop expression.

**3:** <var-w-prop-expression> (= variable name possibly followed by WITH <prop expression>) must be computed first, by taking the full possible "WITH <prop expression>", before applying any operators surrounding <var-with-prop-expresion>.  This is a fundamental unit in building the full boolean expression.

**4:** In the above definition, props start with uppercase letters, and so WITH is followed by a camelcased ID starting with an uppercase letter only.  (In this sense WITH is really an unnecessary keyword but it seems to add to the readability.)

**5:** A prop expression can be thought of as a javascript property of a factor variable (whereas a single prop is a property of the simulation run(s) underlying a factor variable).  Any factor variable  may be seen as simple boolean (no prop expressions associated) or complex boolean (prop expressions associated with it).  A complex boolean may be represented, in javascript, as an object when true (since any object is truthy in javascript).  Then, the object can define props each of which correspond to each full prop expression.  This way, the set of all prop expressions relevant to an activity can be tracked/cached/saved (as an object-form of factor variable) to help with the state management.

## Examples

**a:** setDroughtLevel AND NOT ranSimulation WITH UniqueVegetationPerZone

**parenthesized:** setDroughtLevel AND NOT (ranSimulation WITH UniqueVegetationPerZone)

**meaning:** There is one simulation run with drought level set, and there is one simulation run with unique vegetation per zone.  And the two runs may differ.

**note:** The parenthesized expression illustrates rule 3 where "UniqueVegetationPerZone" is a prop expression.

**b:** ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels

**parenthesized:** ranSimulation WITH (UniqueVegetationPerZone AND NOT UniformDroughtLevels)

**meaning:** There is one simulation run with unique vegetation per zone and non-uniform drought levels.  And both conditions must be satisfied by a single simulation run.

**note:** The prop expression in this case is "UniqueVegetationPerZone AND NOT UniformDroughtLevels".

**c:** ranSimulation WITH UniqueVegetationPerZone AND ranSimulation WITH NOT UniformDroughtLevels

**parenthesized:** (ranSimulation WITH UniqueVegetationPerZone) AND (ranSimulation WITH NOT UniformDroughtLevels)

**meaning:** There is one simulation run with unique vegetation per zone and there is one simulation with non-uniform drought levels.  And the two runs may be distinct.

**note:** The first prop expression is "UniqueVegetationPerZone" since the following two words "And ranSimulation" cannot be part of a prop expression with ranSimulation being a factor variable name (illustrating rule 2).

**d:** ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels AND setWind

(ranSimulation WITH (UniqueVegetationPerZone AND NOT UniformDroughtLevels)) AND setWind

**meaning:** There is one simulation run with unique vegetation per zone and non-uniform drought levels. and there is one simulation run with wind set.  The first run and the second run may be distinct.  The firs run must satisfy the two condition (vegetation and drought levels) at the same time.

**closing remark:** In the future, a factor variable may represent more than one simulation runs.  For (semi-hypothetical) example, "ranTwoSimsWithWindCOV",  "ranSimPausedContinued", or "ranThreeSimsWithWindCOV", could be a factor variable, although a three-run factor variable may be highly unlikely while a two-run factor variable seems quite possible.  For such a factor variable with range > 1, any props defined for it will be the properties of a multiple successive simulation runs, not a single simulation run.

## PRECEDENCE

**i:** <var-w-prop-expression> takes the highest precedence (rule 3 above).

**ii:** <prop-expression> is a "normal" unary/binary expression based on <prop-id> and operators.

**iii:** <log-data-pseud-code-expression> is a "normal" unary/binary/relational expression based on <var-w-prop-expression>'s and operators.

**Note 1:** The precedence of operators (like AND and OR appearing together) is not defined yet (did not need any yet; so we are free to choose any convention).

**Note 2:** The NOT operator applies to <prop-id> or <var-w-prop-expression> without any parenthesis.  If NOT applies to a binary expression, then a parenthesis is necessary (such a case occurred in the "24" sheet).
