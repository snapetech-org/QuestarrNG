import { FaGithub, FaArrowUp } from "react-icons/fa";
import pkg from "../../../package.json";
import semver from "semver";
import { useLatestQuestarrVersion } from "@/hooks/use-latest-questarr-version";
import { InterfaceText } from "@/components/InterfaceText";

interface GitHubVersionLinkProps {
  className?: string;
}

export function GitHubVersionLink({ className }: Readonly<GitHubVersionLinkProps>) {
  const latestVersion = useLatestQuestarrVersion();
  const hasNewerVersion =
    latestVersion && semver.valid(latestVersion) && semver.gt(latestVersion, pkg.version);

  return (
    <a
      href="https://github.com/snapetech-org/QuestarrNG"
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "flex items-center gap-1.5 text-xs text-gray-400 hover:opacity-80 transition-opacity"
      }
    >
      <FaGithub size={14} />
      <span>
        <bdi dir="ltr">
          <InterfaceText source={"QuestarrNG v"} dir="ltr" />
          {pkg.version}
        </bdi>
      </span>
      {hasNewerVersion && (
        <bdi dir="ltr" className="text-emerald-500/70">
          <InterfaceText source={"v"} dir="ltr" />
          {latestVersion} <FaArrowUp className="inline" size={10} />
        </bdi>
      )}
    </a>
  );
}
