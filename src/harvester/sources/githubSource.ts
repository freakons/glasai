import { SourceAdapter } from './sourceAdapter';
import { RawSignal } from '../types';

interface GitHubRelease {
  name: string | null;
  tag_name: string;
  body: string | null;
  html_url: string;
  published_at: string | null;
}

export class GitHubReleaseSource implements SourceAdapter {
  name: string;
  private owner: string;
  private repo: string;

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    this.name = `github:${owner}/${repo}`;
  }

  async fetchSignals(): Promise<RawSignal[]> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/releases`;

    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status} for ${this.owner}/${this.repo}`);
    }

    const releases: GitHubRelease[] = await res.json();
    console.log(`[githubSource] GitHub releases fetched for ${this.owner}/${this.repo}`);

    return releases.map((release) => ({
      title: release.name ?? release.tag_name,
      content: release.body ?? '',
      url: release.html_url,
      source: this.name,
      published_at: release.published_at ?? undefined,
    }));
  }
}
