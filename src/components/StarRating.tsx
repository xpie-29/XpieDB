import { useRef, useState } from "react";
import { Button } from "@fluentui/react-components";
import {
  Star20Filled,
  Star20Regular,
  Dismiss20Regular,
} from "@fluentui/react-icons";

type Props = {
  value: number | null;
  onChange?: (value: number | null) => void;
  compact?: boolean;
  label?: string;
};
export function StarRating({
  value,
  onChange,
  compact = false,
  label = "Personal rating",
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const stars = useRef<Array<HTMLButtonElement | null>>([]);
  const description = value ? `${value} out of 5 stars` : "Unrated";
  const preview = hover ?? value ?? 0;
  if (!onChange)
    return (
      <span
        className={`star-rating readonly ${compact ? "compact" : ""}`}
        role="img"
        aria-label={`${label}: ${description}`}
        title={description}
      >
        {[1, 2, 3, 4, 5].map((n) =>
          n <= (value ?? 0) ? (
            <Star20Filled key={n} aria-hidden />
          ) : (
            <Star20Regular key={n} aria-hidden />
          ),
        )}
      </span>
    );
  return (
    <div className="rating-control">
      <div
        className="star-rating"
        role="radiogroup"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => {
              stars.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            title={`${n} ${n === 1 ? "star" : "stars"}`}
            tabIndex={n === (value ?? 1) ? 0 : -1}
            className="star-button"
            onMouseEnter={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(n)}
            onKeyDown={(e) => {
              let next = n;
              if (["ArrowRight", "ArrowUp"].includes(e.key))
                next = n === 5 ? 1 : n + 1;
              else if (["ArrowLeft", "ArrowDown"].includes(e.key))
                next = n === 1 ? 5 : n - 1;
              else if (e.key === "Home") next = 1;
              else if (e.key === "End") next = 5;
              else if (["Delete", "Backspace"].includes(e.key)) {
                e.preventDefault();
                onChange(null);
                stars.current[0]?.focus();
                return;
              } else return;
              e.preventDefault();
              setHover(null);
              onChange(next);
              stars.current[next - 1]?.focus();
            }}
          >
            {n <= preview ? (
              <Star20Filled aria-hidden />
            ) : (
              <Star20Regular aria-hidden />
            )}
          </button>
        ))}
      </div>
      <Button
        type="button"
        appearance="subtle"
        size="small"
        disabled={value === null}
        icon={<Dismiss20Regular />}
        title="Clear rating"
        aria-label="Clear rating"
        onClick={() => {
          setHover(null);
          onChange(null);
          stars.current[0]?.focus();
        }}
      />
    </div>
  );
}
