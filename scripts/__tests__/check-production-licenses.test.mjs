import { describe, expect, it } from "vitest";
import {
  checkLicensePackages,
  isLicenseExpressionAllowed,
  licenseFromText,
} from "../check-production-licenses.mjs";

describe("production dependency license policy", () => {
  it("accepts a license on the explicit allow-list", () => {
    expect(isLicenseExpressionAllowed("MIT")).toBe(true);
    expect(isLicenseExpressionAllowed("PSF-2.0")).toBe(true);
    expect(isLicenseExpressionAllowed("MIT*")).toBe(true);
  });

  it("applies SPDX AND/OR rules without allowing a disallowed alternative by itself", () => {
    expect(isLicenseExpressionAllowed("MIT AND ISC")).toBe(true);
    expect(isLicenseExpressionAllowed("(BSD-3-Clause OR GPL-2.0)")).toBe(true);
    expect(isLicenseExpressionAllowed("GPL-2.0")).toBe(false);
    expect(isLicenseExpressionAllowed("MIT WITH Classpath-exception-2.0")).toBe(false);
  });

  it("rejects missing license metadata and unknown licenses", () => {
    const result = checkLicensePackages([
      { name: "missing", version: "1.0.0" },
      { name: "restricted", version: "2.0.0", license: "BUSL-1.1" },
    ]);

    expect(result.issues).toHaveLength(2);
    expect(result.issues[0].reason).toContain("no license metadata");
    expect(result.issues[1].reason).toContain("BUSL-1.1");
  });

  it("uses installed license text when package metadata omits a declaration", () => {
    const result = checkLicensePackages([{ name: "legacy-mit", version: "0.0.1" }], () => "MIT*");

    expect(result.issues).toHaveLength(0);
    expect(result.inferred).toHaveLength(1);
  });

  it("infers the legacy MIT marker from conventional license text", () => {
    expect(licenseFromText("## License\n(The MIT License)\nPermission is hereby granted")).toBe(
      "MIT*"
    );
    expect(
      licenseFromText(
        "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and " +
          "associated documentation files (the Software), to deal in the Software without restriction, including " +
          "without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell " +
          "copies of the Software. The above copyright notice and this permission notice shall be included in all " +
          "copies or substantial portions of the Software."
      )
    ).toBe("MIT*");
    expect(
      licenseFromText("Terms are available from the vendor; no standard license is declared.")
    ).toBeNull();
  });
});
