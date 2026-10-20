import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  Field,
  Icon,
  IconButton,
  Segmented,
  Skeleton,
  Switch,
  Tag,
  TaskListSkeleton,
} from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import { Col, Label, Pair, Row, Section } from './Pair';

function LoadingDemo() {
  const [mode, setMode] = useState<'idle' | 'busy' | 'done'>('idle');
  const t = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => t.current.forEach(clearTimeout), []);
  const play = () => {
    setMode('busy');
    t.current.push(
      setTimeout(() => setMode('done'), 1200),
      setTimeout(() => setMode('idle'), 2600),
    );
  };
  return (
    <Row>
      <Button
        loading={mode === 'busy'}
        loadingLabel="Saving…"
        success={mode === 'done'}
        successLabel="Saved"
        onClick={play}
      >
        Save changes
      </Button>
      <Button variant="quiet" size="sm" onClick={play}>
        Play
      </Button>
    </Row>
  );
}

function ProgressDemo() {
  const [p, setP] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const play = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDone(false);
    for (let i = 0; i <= 20; i++) timers.current.push(setTimeout(() => setP(i / 20), i * 100));
    timers.current.push(
      setTimeout(() => setDone(true), 2100),
      setTimeout(() => {
        setDone(false);
        setP(null);
      }, 3500),
    );
  };
  return (
    <Row>
      <Button progress={p ?? undefined} success={done} successLabel="Uploaded" onClick={play}>
        Upload file
      </Button>
      <Button variant="quiet" size="sm" onClick={play}>
        Play
      </Button>
    </Row>
  );
}

function CheckboxDemo({ size, tick }: { size?: 'md' | 'sm'; tick?: 'ink' | 'fill' }) {
  const [on, setOn] = useState(false);
  return (
    <Row>
      <Checkbox label="Cross off" size={size} tick={tick} checked={on} onChange={setOn} />
      <Button variant="quiet" size="sm" onClick={() => setOn(false)}>
        Reset
      </Button>
    </Row>
  );
}

export function Controls() {
  return (
    <Section
      id="controls"
      title="Controls"
      lead="Every control eases its hover and press: colour, fill, edge and tint, never size."
    >
      <Pair
        title="Button"
        note="primary is ink, one per view. secondary for the alternative, quiet for low-stakes actions, danger for delete: red text, still never a red fill."
        render={() => (
          <Col gap={14}>
            <Row>
              <Button>New task</Button>
              <Button variant="secondary">Reconnect</Button>
              <Button variant="quiet">Cancel</Button>
              <Button variant="danger">Delete</Button>
            </Row>
            <Row>
              <Button size="sm">Run</Button>
              <Button size="sm" variant="secondary">
                Save view
              </Button>
              <Button size="sm" variant="quiet">
                Cancel
              </Button>
              <Button icon={<Icon name="plus" size={14} />}>Add a task</Button>
              <Button disabled>Disabled</Button>
            </Row>
            <LoadingDemo />
            <ProgressDemo />
          </Col>
        )}
      />
      <Pair
        title="IconButton"
        note="38px square, radius-md, with a tooltip that names it. Hover or focus one."
        render={() => (
          <Row gap={6}>
            <IconButton label="Search" tipSide="bottom">
              <Icon name="search" />
            </IconButton>
            <IconButton label="Previous day" tipSide="bottom">
              <Icon name="left" />
            </IconButton>
            <IconButton label="Next day" tipSide="bottom">
              <Icon name="right" />
            </IconButton>
            <IconButton label="More" tipSide="right">
              <Icon name="more" />
            </IconButton>
            <IconButton label="Close" tipSide="bottom-end">
              <Icon name="x" />
            </IconButton>
          </Row>
        )}
      />
      <Pair
        title="Checkbox"
        note="The ink tick draws over dur-tick and the sparkle plays. The small one is for subtasks: three stars, no ember."
        render={() => (
          <Col gap={16}>
            <Row gap={24}>
              <Col gap={6}>
                <Label>task, ink</Label>
                <CheckboxDemo />
              </Col>
              <Col gap={6}>
                <Label>subtask</Label>
                <CheckboxDemo size="sm" />
              </Col>
              <Col gap={6}>
                <Label>fill</Label>
                <CheckboxDemo tick="fill" />
              </Col>
              <Col gap={6}>
                <Label>disabled</Label>
                <Checkbox label="Disabled" disabled />
              </Col>
              <Col gap={6}>
                <Label>done</Label>
                <Checkbox label="Done" defaultChecked sparkle={false} />
              </Col>
            </Row>
          </Col>
        )}
      />
      <Pair
        title="Tag and Chip"
        render={() => (
          <Col gap={14}>
            <Row>
              <Tag tone="team">Northwind</Tag>
              <Tag tone="project">Platform</Tag>
              <Tag tone="jira">TUDU-212</Tag>
              <Tag>Thu 22 Oct</Tag>
            </Row>
            <Row>
              <Chip label="Northwind" color="#3d5a80" onClear={() => {}} />
              <Chip label="Home" color="#8a5a00" />
            </Row>
          </Col>
        )}
      />
      <Pair
        title="Segmented"
        note="The paper thumb slides to the chosen item. Labels keep one weight. Arrow keys move the choice."
        render={() => (
          <Row>
            <Segmented
              label="View"
              defaultValue="one"
              items={[
                { value: 'one', label: 'Day' },
                { value: 'two', label: '2 days' },
              ]}
            />
            <Segmented
              label="List"
              defaultValue="todo"
              items={[
                { value: 'todo', label: 'To do' },
                { value: 'done', label: 'Crossed off' },
              ]}
            />
          </Row>
        )}
      />
      <Pair
        title="Field"
        note="Focus is an ink edge with a soft halo, never red. With an error the field stays alive in red."
        render={() => (
          <Col gap={12}>
            <Field label="Email" placeholder="you@example.com" style={{ width: 280 }} />
            <Field
              label="Search"
              placeholder="Search tasks, a very long placeholder that will end in an ellipsis"
              icon={<Icon name="search" />}
              style={{ width: 280 }}
            />
            <Field
              label="Address"
              defaultValue="leo@acme"
              error="That isn’t an email address"
              style={{ width: 280 }}
            />
          </Col>
        )}
      />
      <Pair
        title="Switch and Avatar"
        render={() => (
          <Row gap={24}>
            <Switch label="Notify me" defaultChecked />
            <Switch label="Jira updates" />
            <Switch label="Off and disabled" disabled />
            <Avatar initials="RR" name="Rohit Raj" />
            <Avatar initials="MI" name="Meera Iyer" color="#3d5a80" />
            <Avatar initials="AK" name="Arjun Kapoor" color="#5b7553" size="sm" />
          </Row>
        )}
      />
      <Pair
        title="Skeleton"
        note="Shimmer bars in the shape of rows. No spinners on the day page."
        render={() => (
          <Col gap={12}>
            <Skeleton width="60%" />
            <TaskListSkeleton rows={3} />
          </Col>
        )}
      />
    </Section>
  );
}
