"use strict";

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
  const today = new Date().toISOString();
  const defaultStartDate = "2017-10-01T00:00:00.000Z";
  const defaultEndDate = today;

  // Fetch validity dates from agreement context
  let startDate = agreement.context.validity?.initial || defaultStartDate;
  let endDate = agreement.context.validity?.end || defaultEndDate;

  // Check the rules for end date
  if (endDate) {
    const currentDate = new Date().toISOString();
    if (new Date(endDate) > new Date(currentDate)) {
      endDate = currentDate;
    }
  }

  modifiedDashboard.time.from = startDate;
  modifiedDashboard.time.to = endDate;

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
