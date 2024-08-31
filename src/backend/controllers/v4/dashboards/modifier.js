"use strict";

// Course Dates initialization
const courseDates = {
  "CS169-f16": {
    from: "2016-10-01T00:00:00.000Z",
    to: "2016-12-31T00:00:00.000Z",
  },
  "CS169-f17": {
    from: "2017-10-01T00:00:00.000Z",
    to: "2017-12-31T00:00:00.000Z",
  },
  "CS169-s19": {
    from: "2019-03-01T00:00:00.000Z",
    to: "2019-06-01T00:00:00.000Z",
  },
};

function modifyJSON(jsonDashboard, agreement, dashboardName) {
  // Dashboard to return
  let modifiedDashboard = { ...jsonDashboard };
  modifiedDashboard.panels = [];

  // Y pos offset. Increases for each guarantee
  let yOffset = 0;

  // Create panels for each guarantee and add them to the dashboard
  for (let guarantee of agreement.terms.guarantees) {
    // Create panels and replace with values from the agreement guarantee
    let newPanels = JSON.stringify(jsonDashboard.panels);

    // Replace placeholders with actual values
    newPanels = newPanels.replace(
      /"###GUARANTEE.THRESHOLD###"/g,
      guarantee.of[0].objective.split(" ").pop()
    );
    newPanels = newPanels.replace(/###GUARANTEE.NAME###/g, guarantee.id);

    newPanels = JSON.parse(newPanels);

    for (let panel of newPanels) {
      if (panel.type === "graph") {
        panel.bars = true;
        panel.fill = 1;
        panel.staircase = true;
      }
      if (panel.type === "table") {
        panel.fieldConfig = {
          defaults: {
            custom: {
              align: "center",
            },
            thresholds: {
              mode: "absolute",
              steps: [
                { color: "red", value: null }, // Color red for values below 50
                { color: "green", value: 50 }, // Color green for values 50 and above
              ],
            },
          },
          overrides: [
            {
              matcher: {
                id: "byName",
                options: "metrics_values.guaranteeValue",
              },
              properties: [
                { id: "displayName", value: "Guarantee value" }, // Set custom display name
                {
                  id: "custom.displayMode",
                  value: "color-background",
                },
              ],
            },
          ],
        };
        panel.options.showHeader = true;
      }

      // Set the grid position for the panel
      panel.gridPos = {
        h: 8,
        w: panel.type === "table" ? 6 : 18,
        x: panel.type === "table" ? 18 : 0,
        y: yOffset,
      };

      panel.id += yOffset;
      panel.title = `${guarantee.id}`;

      yOffset += panel.gridPos.h;
    }

    // Add the panels to the modified dashboard
    modifiedDashboard.panels = modifiedDashboard.panels.concat(newPanels);
  }

  // Adjust date range
  const courseDate =
    courseDates[agreement.context.definitions.scopes.development.class.default];
  if (courseDate !== undefined) {
    modifiedDashboard.time.from = courseDate.from;
    modifiedDashboard.time.to = courseDate.to;
  } else {
    modifiedDashboard.time.from = "2017-01-01T00:00:00.000Z";
    modifiedDashboard.time.to = new Date().toISOString();
  }

  // Substitute remaining attributes
  modifiedDashboard = JSON.stringify(modifiedDashboard);
  modifiedDashboard = modifiedDashboard.replace(
    /###COURSE.ID###/g,
    agreement.context.definitions.scopes.development.class.default
  );
  modifiedDashboard = modifiedDashboard.replace(
    /###AGREEMENT.ID###/g,
    agreement.id
  );

  return JSON.parse(modifiedDashboard);
}

module.exports.modifyJSON = modifyJSON;
